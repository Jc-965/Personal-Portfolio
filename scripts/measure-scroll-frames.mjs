import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

// Drives a production preview through real interactions in headed Chrome on the hardware GPU and records frame
// pacing for each one: wheel scrolling through the hero, the Journey list, and the Projects section, opening and
// scrolling a project journey, and opening and switching a role journey. The window must stay visible and
// uncovered while it runs. Usage: node scripts/measure-scroll-frames.mjs <output-directory> <url>
// PERF_CPU=4 slows the main thread by that factor, to stand in for a slower processor. PERF_DEVICE=phone uses a
// phone viewport with touch input, where the page scrolls natively. Neither changes the GPU, which Chrome cannot
// slow down.
const output = process.argv[2] || 'output/playwright/performance/scroll'
const baseURL = process.argv[3] || process.env.PERF_URL || 'http://127.0.0.1:4397'
const runs = Number(process.env.PERF_RUNS || 1)
const only = new Set((process.env.PERF_SCENARIOS || '').split(',').filter(Boolean))
const cpuRate = Number(process.env.PERF_CPU || 1)
const phone = process.env.PERF_DEVICE === 'phone'
await mkdir(output, { recursive: true })

const browser = await chromium.launch({
  headless: false,
  channel: process.env.PERF_CHANNEL || 'chrome',
  // An occluded or unfocused window stops producing frames, which the probe would record as dropped frames.
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
})

/** Runs in the page before any script. Records every frame's time, which canvases drew in it, and long frames. */
function probe() {
  const raf = window.requestAnimationFrame.bind(window)
  const state = { frames: [], paints: {}, loaf: [], long: [] }
  window.__scrollProbe = state
  const labels = new WeakMap()
  const painted = new Set()
  const labelOf = (canvas) => {
    let label = labels.get(canvas)
    if (!label) {
      const owner = canvas.closest?.('[id^="project-"], .hero, #journey')
      label = `${owner?.id || owner?.className?.split?.(' ')[0] || 'page'}:${canvas.className || 'canvas'}`
      labels.set(canvas, label)
    }
    return label
  }
  for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const original = WebGL2RenderingContext.prototype[method]
    WebGL2RenderingContext.prototype[method] = function (...args) {
      if (this.canvas instanceof HTMLCanvasElement) painted.add(labelOf(this.canvas))
      return Reflect.apply(original, this, args)
    }
  }
  // The probe registers first, so it runs before the page's own callbacks, and the canvases it sees drew in the
  // frame before. The one-frame offset does not change a rate.
  const step = (time) => {
    state.frames.push(time)
    for (const label of painted) (state.paints[label] ??= []).push(time)
    painted.clear()
    raf(step)
  }
  raf(step)
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const script = [...(entry.scripts ?? [])].sort((a, b) => b.duration - a.duration)[0]
        state.loaf.push({
          start: entry.startTime,
          duration: entry.duration,
          blocking: entry.blockingDuration,
          script: script ? `${script.invoker || script.name} ${script.sourceFunctionName || ''} ${(script.sourceURL || '').split('/').pop()} ${Math.round(script.duration)}ms`.replace(/\s+/g, ' ') : '',
        })
      }
    }).observe({ type: 'long-animation-frame', buffered: true })
  } catch {
    // The long-animation-frame entry type is optional.
  }
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) state.long.push({ start: entry.startTime, duration: entry.duration })
  }).observe({ type: 'longtask', buffered: true })
}

const median = (values) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
const round = (value, digits = 1) => Number(value.toFixed(digits))

/** Frame pacing between two page times. A dropped frame is a display refresh that passed with no frame. */
function summarise(state, refreshMs, from, to) {
  const frames = state.frames.filter((time) => time >= from && time <= to)
  const intervals = frames.slice(1).map((time, index) => time - frames[index])
  const sorted = [...intervals].sort((a, b) => a - b)
  const dropped = intervals.reduce((sum, ms) => sum + Math.max(0, Math.round(ms / refreshMs) - 1), 0)
  const seconds = Math.max(1e-3, (to - from) / 1000)
  const paints = Object.fromEntries(Object.entries(state.paints)
    .map(([label, times]) => [label, round(times.filter((time) => time >= from && time <= to).length / seconds)])
    .filter(([, perSecond]) => perSecond > 0))
  const loaf = state.loaf.filter((entry) => entry.start >= from && entry.start <= to)
  const long = state.long.filter((entry) => entry.start >= from && entry.start <= to)
  return {
    seconds: round(seconds, 2),
    framesPerSecond: round(frames.length / seconds),
    droppedFrames: dropped,
    droppedPercent: round((dropped * 100) / Math.max(1, dropped + intervals.length)),
    p95Ms: round(quantile(sorted, 0.95)),
    p99Ms: round(quantile(sorted, 0.99)),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
    framesOver50Ms: intervals.filter((ms) => ms > 50).length,
    longTasks: long.length,
    longTaskMs: round(long.reduce((sum, entry) => sum + entry.duration, 0)),
    longestTaskMs: round(long.reduce((max, entry) => Math.max(max, entry.duration), 0)),
    longFrames: loaf.length,
    blockingMs: round(loaf.reduce((sum, entry) => sum + entry.blocking, 0)),
    worstFrames: [...loaf].sort((a, b) => b.duration - a.duration).slice(0, 3).map((entry) => `${Math.round(entry.duration)}ms ${entry.script}`),
    paintsPerSecond: paints,
  }
}

const results = []
try {
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext(phone
      ? { viewport: { width: 412, height: 839 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
    // Never write visitor data during measurement.
    await context.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(probe)
    const cdp = await context.newCDPSession(page)
    if (cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })

    const now = () => page.evaluate(() => performance.now())
    const scrollY = () => page.evaluate(() => window.scrollY)
    const windows = []
    const scenario = async (name, action) => {
      if (only.size && !only.has(name)) { await action(true); return }
      const from = await now()
      await action(false)
      windows.push({ name, from, to: await now() })
    }
    /** Wheels toward a page offset in small steps, as a trackpad does, until the page reaches it or stops moving. */
    const wheelTo = async (target, { step = 20, every = 16, maxMs = 40_000 } = {}) => {
      const started = Date.now()
      let last = await scrollY()
      let stalled = 0
      const direction = Math.sign(target - last) || 1
      // A phone scrolls by touch, which the browser runs on its compositor thread. The gesture moves the finger up
      // to scroll down, in strokes of 600 px at about 1,200 px per second.
      while (phone && Date.now() - started < maxMs) {
        await cdp.send('Input.synthesizeScrollGesture', { x: 200, y: direction > 0 ? 650 : 200, yDistance: -direction * 600, speed: 1200, gestureSourceType: 'touch' })
        const y = await scrollY()
        if ((direction > 0 && y >= target) || (direction < 0 && y <= target)) return
        stalled = Math.abs(y - last) < 1 ? stalled + 1 : 0
        if (stalled > 3) return
        last = y
      }
      while (Date.now() - started < maxMs) {
        for (let i = 0; i < 12; i++) {
          await page.mouse.wheel(0, direction * step)
          await page.waitForTimeout(every)
        }
        const y = await scrollY()
        if ((direction > 0 && y >= target) || (direction < 0 && y <= target)) break
        stalled = Math.abs(y - last) < 1 ? stalled + 1 : 0
        if (stalled > 6) break
        last = y
      }
    }
    const topOf = (selector) => page.locator(selector).evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
    const bottomOf = (selector) => page.locator(selector).evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY)

    await page.goto(baseURL)
    await page.evaluate(() => document.fonts.ready)
    if (!phone) await page.mouse.move(300, 450)
    await page.waitForTimeout(5000)

    await scenario('rest-at-top', () => page.waitForTimeout(2000))
    await scenario('first-scroll-through-hero', async () => {
      await wheelTo((await topOf('#journey')) - 200)
      await page.waitForTimeout(600)
    })
    await scenario('journey-list', async () => {
      await wheelTo((await topOf('#projects')) - (phone ? 839 : 900))
      await page.waitForTimeout(600)
    })
    await scenario('projects', async () => {
      await wheelTo((await bottomOf('#projects')) - 450)
      await page.waitForTimeout(600)
    })
    await scenario('rest-at-skills', async () => {
      await wheelTo((await topOf('#skills')) + 100)
      await page.waitForTimeout(2500)
    })

    // A project journey: land on the ParkiWell preview, press into the phone, scroll the journey, and leave.
    const parkiwell = page.locator('#project-parkiwell')
    await parkiwell.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + (el.clientHeight - innerHeight) * 0.7, behavior: 'instant' }))
    await page.waitForFunction(() => document.querySelector('#project-parkiwell')?.classList.contains('is-gl'), null, { timeout: 60_000 })
    await page.waitForTimeout(3000)
    await scenario('open-project-journey', async () => {
      await (phone ? parkiwell.locator('.teardown__open').tap() : parkiwell.locator('.teardown__open').click())
      await page.waitForTimeout(3000)
    })
    await scenario('scroll-project-journey', async () => {
      await wheelTo((await scrollY()) + 2700)
      await page.waitForTimeout(600)
    })
    await scenario('close-project-journey', async () => {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(2500)
    })

    // A role journey: land on the first row, open its world, scroll, switch to the next role, and leave.
    const row = page.locator('.roles__stop').first()
    await row.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: 'instant' }))
    await page.waitForTimeout(4000)
    await scenario('open-role-journey', async () => {
      const explore = row.getByRole('button', { name: /explore the journey/i })
      await (phone ? explore.tap() : explore.click())
      await page.waitForTimeout(3500)
    })
    await scenario('scroll-role-journey', async () => {
      await wheelTo((await scrollY()) + 1800)
      await page.waitForTimeout(600)
    })
    await scenario('switch-role', async () => {
      const stops = page.locator('.role-journey__stops button')
      if (await stops.count() > 1) await (phone ? stops.nth(1).tap() : stops.nth(1).click())
      await page.waitForTimeout(3500)
    })
    await scenario('close-role-journey', async () => {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(2500)
    })

    const state = await page.evaluate(() => window.__scrollProbe)
    const measures = await page.evaluate(() => performance.getEntriesByType('measure')
      .filter((entry) => /^(chapter|roles):/.test(entry.name))
      .map((entry) => ({ name: entry.name, start: Math.round(entry.startTime), ms: Math.round(entry.duration) })))
    const gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      const debug = gl?.getExtension('WEBGL_debug_renderer_info')
      return gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unknown'
    })
    const refreshMs = median(state.frames.slice(1).map((time, index) => time - state.frames[index]))
    const summary = Object.fromEntries(windows.map(({ name, from, to }) => [name, summarise(state, refreshMs, from, to)]))
    results.push({ run, device: phone ? 'phone' : 'desktop', cpuRate, refreshHz: round(1000 / refreshMs), gpu, summary, measures, errors })
    for (const [name, stats] of Object.entries(summary)) {
      console.log(`${name.padEnd(28)} ${String(stats.framesPerSecond).padStart(6)} fps  dropped ${String(stats.droppedPercent).padStart(5)}%  p99 ${String(stats.p99Ms).padStart(6)} ms  max ${String(stats.maxMs).padStart(6)} ms  long tasks ${String(stats.longTasks).padStart(2)} (${stats.longTaskMs} ms)  ${JSON.stringify(stats.paintsPerSecond)}`)
    }
    await writeFile(`${output}/results.json`, JSON.stringify({ baseURL, browser: browser.version(), results }, null, 2))
    await context.close()
  }
} finally {
  await browser.close()
}
