import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

// Run against a production preview. Keep viewport, sampling time and browser
// identical between builds; this is a local benchmark, not a Lighthouse score.
const baseURL = process.env.PERF_URL || 'http://127.0.0.1:4397'
const output = process.argv[2] || 'output/playwright/performance/current'
const runs = Number(process.env.PERF_RUNS || 3)
await mkdir(output, { recursive: true })
// PERF_GPU=1 runs headed Chrome on the hardware GPU and adds frame pacing and long-animation-frame figures to every
// sample. The default run stays headless, where Chromium renders with SwiftShader. PERF_CHANNEL selects another
// installed browser channel.
const hardware = process.env.PERF_GPU === '1'
const browser = await chromium.launch(hardware ? {
  headless: false,
  channel: process.env.PERF_CHANNEL || 'chrome',
  // An occluded or unfocused window stops producing frames, which the frame probe would record as late frames.
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
} : undefined)
const results = []
let gpu = null

/** Frame pacing over one sample. A frame is late when its interval exceeds 1.5 times the sample's median interval. */
function frameStats(intervals) {
  if (intervals.length === 0) return { count: 0 }
  const sorted = [...intervals].sort((a, b) => a - b)
  const at = (quantile) => sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))]
  const medianMs = at(0.5)
  return {
    count: sorted.length,
    medianMs,
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted[sorted.length - 1],
    late: sorted.filter((ms) => ms > medianMs * 1.5).length,
  }
}

function instrument({ hardware }) {
  const stats = { raf: 0, clears: 0, clearPixels: 0, draws: 0, longTasks: 0, longTaskMs: 0 }
  window.__perf = stats
  const raf = window.requestAnimationFrame
  window.requestAnimationFrame = (callback) => raf.call(window, (time) => { stats.raf++; callback(time) })
  const clear = CanvasRenderingContext2D.prototype.clearRect
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (this.canvas.className === 'cursor-canvas') {
      stats.clears++
      const transform = this.getTransform()
      stats.clearPixels += Math.abs(args[2] * args[3] * (transform.a * transform.d - transform.b * transform.c))
    }
    return Reflect.apply(clear, this, args)
  }
  for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const original = WebGL2RenderingContext.prototype[method]
    WebGL2RenderingContext.prototype[method] = function (...args) {
      stats.draws++
      return Reflect.apply(original, this, args)
    }
  }
  new PerformanceObserver((list) => {
    for (const task of list.getEntries()) { stats.longTasks++; stats.longTaskMs += task.duration }
  }).observe({ type: 'longtask', buffered: true })
  if (!hardware) return
  // The frame probe runs on every frame through the unwrapped requestAnimationFrame, so stats.raf still counts only
  // the page's own callbacks. A page under the probe never idles, so task time at rest is higher than in a default run.
  const frames = { last: 0, intervals: [] }
  window.__perfFrames = frames
  const step = (time) => {
    if (frames.last) frames.intervals.push(time - frames.last)
    frames.last = time
    raf.call(window, step)
  }
  raf.call(window, step)
  const loaf = { count: 0, durationMs: 0, blockingMs: 0 }
  window.__perfLoaf = loaf
  new PerformanceObserver((list) => {
    for (const frame of list.getEntries()) { loaf.count++; loaf.durationMs += frame.duration; loaf.blockingMs += frame.blockingDuration }
  }).observe({ type: 'long-animation-frame', buffered: true })
}

async function sample(page, cdp, name, run, device, readyMs = null) {
  await cdp.send('HeapProfiler.collectGarbage')
  const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]))
  const start = await page.evaluate(() => {
    if (window.__perfFrames) window.__perfFrames.intervals = []
    return { ...window.__perf, loaf: window.__perfLoaf && { ...window.__perfLoaf }, time: performance.now() }
  })
  await page.waitForTimeout(2000)
  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]))
  const info = await page.evaluate(() => ({
    ...window.__perf,
    time: performance.now(),
    canvases: [...document.querySelectorAll('canvas')].map(c => ({ class: c.className, width: c.width, height: c.height })),
    resources: performance.getEntriesByType('resource').map(r => ({ url: r.name.replace(location.origin, ''), bytes: r.encodedBodySize })),
    paints: performance.getEntriesByType('paint').map(p => ({ name: p.name, ms: p.startTime })),
    frameIntervals: window.__perfFrames && window.__perfFrames.intervals.slice(),
    loaf: window.__perfLoaf && { ...window.__perfLoaf },
  }))
  const duration = (info.time - start.time) / 1000
  const result = {
    name, run, device, readyMs,
    heapMiB: before.JSHeapUsedSize / 1048576,
    taskMsPerSecond: (after.TaskDuration - before.TaskDuration) * 1000 / duration,
    layoutMsPerSecond: (after.LayoutDuration - before.LayoutDuration) * 1000 / duration,
    rafPerSecond: (info.raf - start.raf) / duration,
    drawsPerSecond: (info.draws - start.draws) / duration,
    cursorClearPixelsPerSecond: (info.clearPixels - start.clearPixels) / duration,
    longTasks: info.longTasks,
    longTaskMs: info.longTaskMs,
    resourceBytes: info.resources.reduce((sum, r) => sum + r.bytes, 0),
    ...(hardware ? {
      frames: frameStats(info.frameIntervals),
      longAnimationFrames: {
        count: info.loaf.count - start.loaf.count,
        durationMs: info.loaf.durationMs - start.loaf.durationMs,
        blockingMs: info.loaf.blockingMs - start.loaf.blockingMs,
      },
    } : {}),
    ...Object.fromEntries(['canvases', 'resources', 'paints'].map(k => [k, info[k]])),
  }
  results.push(result)
  if (run === 0) await page.screenshot({ path: `${output}/${device}-${name}.png` })
  console.log(JSON.stringify({ ...result, canvases: undefined, resources: undefined, paints: undefined }))
  await writeFile(`${output}/results.json`, JSON.stringify({ browser: browser.version(), baseURL, ...(hardware ? { hardware: true, gpu } : {}), results }, null, 2))
}

try {
  for (const device of ['desktop', 'mobile']) {
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext(device === 'desktop'
        ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
        : { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
      // Never write visitor data during measurement, and make external services
      // deterministic. Font responses remain real and are allowed to finish.
      await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.addInitScript(instrument, { hardware })
      const cdp = await context.newCDPSession(page)
      await cdp.send('Performance.enable')
      // The renderer name in the results shows whether the run reached the hardware GPU.
      if (hardware && gpu === null) {
        gpu = await page.evaluate(() => {
          const gl = document.createElement('canvas').getContext('webgl2')
          const info = gl && gl.getExtension('WEBGL_debug_renderer_info')
          const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
          if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext()
          return name
        })
      }
      await page.goto(baseURL)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(3500)
      await sample(page, cdp, 'landing', run, device)
      const previewStarted = performance.now()
      await page.locator('#projects').scrollIntoViewIfNeeded()
      await page.locator('#project-parkiwell').evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'instant' }))
      await page.waitForFunction(() => document.querySelector('#project-parkiwell')?.classList.contains('is-gl'), null, { timeout: 30000 })
      const previewReadyMs = performance.now() - previewStarted
      await page.waitForTimeout(3500)
      if (device === 'desktop') await page.mouse.move(1100, 700)
      await page.waitForTimeout(3000)
      await sample(page, cdp, 'project-preview', run, device, previewReadyMs)
      if (device === 'desktop') {
        await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseleave')))
        await page.waitForTimeout(1500)
        await sample(page, cdp, 'pointer-away', run, device)
      }
      if (errors.length) throw new Error(errors.join('\n'))
      await context.close()
    }
  }
} finally {
  await browser.close()
}
