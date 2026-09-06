/* global process, window, document, navigator, performance, requestAnimationFrame, console */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

// Real GPU evidence. Run one browser at a time to avoid competing GPU heaps.
const flags = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')))
const phase = flags.phase ?? 'verification'
const tier = flags.tier ?? 'high'
const folder = resolve(`screenshots/grid/${phase}/${tier}`)
await mkdir(folder, { recursive: true })
const browser = await chromium.launch({
  headless: flags.headless === 'true', channel: 'chrome', args: ['--use-angle=metal'],
})
const context = await browser.newContext({
  viewport: { width: Number(flags.width ?? 1440), height: Number(flags.height ?? 900) },
  deviceScaleFactor: tier === 'high' ? 1.35 : tier === 'mid' ? 1.2 : 1,
  ...(flags.video ? { recordVideo: { dir: folder, size: { width: 1280, height: 800 } } } : {}),
  reducedMotion: flags.reduced === 'true' ? 'reduce' : 'no-preference',
})
const page = await context.newPage()
if (flags.post || flags.reflections) {
  await page.route('**/src/components/TheGrid/gridPerformance.ts*', async route => {
    const response = await route.fetch()
    let body = await response.text()
    if (flags.post === 'false') body = body.replaceAll('postEnabled: true', 'postEnabled: false')
    if (flags.reflections === 'false') body = body.replaceAll('reflections: true', 'reflections: false')
    await route.fulfill({ response, body })
  })
}
const cdp = flags.trace ? await context.newCDPSession(page) : null
await page.addInitScript(tier => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => tier === 'low' ? 4 : tier === 'mid' ? 6 : 12 })
  Object.defineProperty(navigator, 'deviceMemory', { get: () => tier === 'low' ? 4 : tier === 'mid' ? 6 : 16 })
}, tier)
const logs = []
page.on('pageerror', error => logs.push({ kind: 'pageerror', message: error.message }))
page.on('console', message => {
  // App Check logs include local debug tokens. Keep only relevant diagnostics.
  if (/Context Lost|GL_INVALID|shader error|Shader Error|THREE.WebGLProgram/i.test(message.text())) {
    logs.push({ kind: message.type(), message: message.text() })
  }
})
const diagnostics = async () => page.evaluate(() => {
  const gl = window.__gridRenderer
  const context = gl?.getContext() ?? document.querySelector('.grid-overlay canvas')?.getContext('webgl2')
  const ext = context?.getExtension('WEBGL_debug_renderer_info')
  return {
    gpu: ext ? context.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
    lost: context?.isContextLost() ?? true,
    camera: window.__gridCamera?.position.toArray(),
    render: gl?.info.render, memory: gl?.info.memory,
    state: window.render_game_to_text ? JSON.parse(window.render_game_to_text()) : null,
  }
})
const frameSample = async () => page.evaluate(() => new Promise(resolve => {
  const samples = []
  let previous = performance.now()
  function tick(now) {
    samples.push(now - previous); previous = now
    if (samples.length < 120) requestAnimationFrame(tick)
    else {
      const sorted = samples.slice(5).sort((a, b) => a - b)
      resolve({ median: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) })
    }
  }
  requestAnimationFrame(tick)
}))
const report = { phase, tier, reduced: flags.reduced === 'true', samples: [], logs }
try {
  await page.goto(`${flags.url ?? 'http://127.0.0.1:5173/'}?grid=1`)
  await page.locator('[data-grid-phase="active"]').waitFor({ timeout: 60000 })
  await page.waitForTimeout(1500)
  if (cdp) await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline.frame,gpu',
    transferMode: 'ReturnAsStream',
  })
  const names = ['home', 'journey', 'projects', 'beyond', 'skills', 'sky']
  for (let i = 0; i < names.length; i++) {
    if (flags.station && Number(flags.station) !== i) continue
    await page.evaluate(i => window.__grid.navigate(i), i)
    await page.waitForTimeout(2200)
    const state = await diagnostics()
    const frames = state.lost ? null : await frameSample()
    report.samples.push({ name: names[i], ...state, frames })
    await page.screenshot({ path: `${folder}/${names[i]}.png`, scale: 'css' })
    console.log(JSON.stringify({ station: names[i], lost: state.lost, frames }))
  }
  if (flags.soak) {
    const until = Date.now() + Number(flags.soak)
    let leg = 0
    while (Date.now() < until) {
      await page.evaluate(i => window.__grid.navigate(i), leg++ % 6)
      await page.waitForTimeout(10000)
      const state = await diagnostics()
      report.samples.push({ name: `soak-${leg}`, ...state })
      console.log(JSON.stringify({ soak: leg * 10, lost: state.lost }))
      if (state.lost) break
    }
  }
  report.final = await diagnostics()
} catch (error) {
  report.error = String(error)
  process.exitCode = 1
} finally {
  if (cdp) {
    const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
    await cdp.send('Tracing.end')
    const { stream } = await completed
    let trace = ''
    for (;;) {
      const part = await cdp.send('IO.read', { handle: stream })
      trace += part.data
      if (part.eof) break
    }
    await cdp.send('IO.close', { handle: stream })
    await writeFile(`${folder}/performance-trace.json.gz`, gzipSync(trace))
  }
  await context.close()
  await browser.close()
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2))
}
if (report.samples.some(sample => sample.lost) || logs.length) process.exitCode = 1
