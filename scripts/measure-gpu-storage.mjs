import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

// Counts requested WebGL2 texture/renderbuffer storage, not driver/process RAM.
// WeakMaps avoid keeping deleted GPU objects alive. Default canvas buffers,
// geometry, shaders, browser caches and driver padding are excluded.
function instrumentStorage() {
  const contexts = []
  window.__gpuStorage = contexts
  const getContext = HTMLCanvasElement.prototype.getContext
  const seen = new WeakSet()
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = Reflect.apply(getContext, this, args)
    if (args[0] !== 'webgl2' || !gl || seen.has(gl)) return gl
    seen.add(gl)
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    const state = {
      class: this.className, owner: this.closest('section')?.id,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      textureBytes: 0, renderbufferBytes: 0, lost: false,
    }
    contexts.push(state)
    const bytes = new Map([
      [gl.R8, 1], [gl.RG8, 2], [gl.RGB8, 3], [gl.SRGB8, 3],
      [gl.RGBA8, 4], [gl.SRGB8_ALPHA8, 4], [gl.RGBA16F, 8], [gl.RGBA32F, 16],
      [gl.R16F, 2], [gl.RG16F, 4], [gl.R32F, 4], [gl.RG32F, 8],
      [gl.DEPTH_COMPONENT16, 2], [gl.DEPTH_COMPONENT24, 4],
      [gl.DEPTH_COMPONENT32F, 4], [gl.DEPTH24_STENCIL8, 4],
    ])
    const sizes = new WeakMap()
    const levelsByTexture = new WeakMap()
    const baseByTexture = new WeakMap()
    const immutable = new WeakSet()
    const textures = new Map()
    let unit = gl.TEXTURE0
    let renderbuffer = null
    const wrap = (name, observe) => {
      const original = gl[name]
      gl[name] = function (...args) {
        const result = Reflect.apply(original, gl, args)
        observe(...args)
        return result
      }
    }
    const record = (object, size, key) => {
      if (!object) return
      state[key] += size - (sizes.get(object) || 0)
      sizes.set(object, size)
    }
    wrap('activeTexture', value => { unit = value })
    wrap('bindTexture', (target, texture) => textures.set(`${unit}:${target}`, texture))
    wrap('texStorage2D', (target, levels, format, width, height) => {
      let pixels = 0
      for (let i = 0; i < levels; i++) pixels += Math.max(1, width >> i) * Math.max(1, height >> i)
      if (!bytes.has(format)) throw new Error(`Unmeasured texture format ${format}`)
      const texture = textures.get(`${unit}:${target}`)
      immutable.add(texture)
      record(texture, pixels * bytes.get(format) * (target === gl.TEXTURE_CUBE_MAP ? 6 : 1), 'textureBytes')
    })
    wrap('texImage2D', (...args) => {
      const [target, level, format] = args
      const cube = target >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
      const texture = textures.get(`${unit}:${cube ? gl.TEXTURE_CUBE_MAP : target}`)
      if (!texture) return
      const source = args[5]
      const width = args.length >= 9 ? args[3] : source.width
      const height = args.length >= 9 ? args[4] : source.height
      const type = args.length >= 9 ? args[7] : args[4]
      const components = format === gl.RGBA ? 4 : format === gl.RGB ? 3 : format === gl.RG ? 2 : 1
      const bpp = bytes.get(format) || components * (type === gl.FLOAT ? 4 : type === gl.HALF_FLOAT ? 2 : 1)
      const levels = levelsByTexture.get(texture) || new Map()
      levelsByTexture.set(texture, levels)
      levels.set(`${target}:${level}`, width * height * bpp)
      if (level === 0) baseByTexture.set(texture, { target, width, height, bpp, faces: cube ? 6 : 1 })
      record(texture, [...levels.values()].reduce((a, b) => a + b, 0), 'textureBytes')
    })
    wrap('generateMipmap', target => {
      const texture = textures.get(`${unit}:${target}`)
      if (!texture || immutable.has(texture)) return
      const base = baseByTexture.get(texture)
      if (!base) return
      let pixels = 0
      for (let w = base.width, h = base.height; ; w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) {
        pixels += w * h
        if (w === 1 && h === 1) break
      }
      record(texture, pixels * base.bpp * base.faces, 'textureBytes')
    })
    wrap('deleteTexture', texture => record(texture, 0, 'textureBytes'))
    wrap('bindRenderbuffer', (_target, value) => { renderbuffer = value })
    wrap('renderbufferStorage', (_target, format, width, height) => {
      if (!bytes.has(format)) throw new Error(`Unmeasured renderbuffer format ${format}`)
      record(renderbuffer, width * height * bytes.get(format), 'renderbufferBytes')
    })
    wrap('renderbufferStorageMultisample', (_target, samples, format, width, height) => {
      if (!bytes.has(format)) throw new Error(`Unmeasured renderbuffer format ${format}`)
      record(renderbuffer, width * height * Math.max(1, samples) * bytes.get(format), 'renderbufferBytes')
    })
    wrap('deleteRenderbuffer', object => record(object, 0, 'renderbufferBytes'))
    this.addEventListener('webglcontextlost', () => {
      state.lost = true
      state.textureBytes = state.renderbufferBytes = 0
      textures.clear()
    })
    return gl
  }
}

const output = process.argv[2] || 'output/playwright/performance/storage'
const urls = process.argv.slice(3)
if (!urls.length) urls.push('http://127.0.0.1:4397')
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const results = []
try {
  for (const url of urls) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
    await context.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    const page = await context.newPage()
    await page.addInitScript(instrumentStorage)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url)
    await page.locator('#projects').scrollIntoViewIfNeeded()
    await page.locator('#project-parkiwell').evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + (el.clientHeight - innerHeight) * 0.7, behavior: 'instant' }))
    await page.waitForFunction(() => document.querySelector('#project-parkiwell')?.classList.contains('is-gl'), null, { timeout: 60000 })
    // Give every preloaded scene time to finish its upload queue, then require
    // stable storage across consecutive observations.
    await page.waitForTimeout(6000)
    let last = ''
    for (let i = 0; i < 10; i++) {
      const now = await page.evaluate(() => JSON.stringify(window.__gpuStorage))
      if (now === last) break
      last = now
      await page.waitForTimeout(1500)
    }
    const capture = async (stage) => {
      const data = await page.evaluate(() => ({
        contexts: window.__gpuStorage,
        cursorPixels: [...document.querySelectorAll('.cursor-canvas')].reduce((n, c) => n + c.width * c.height, 0),
      }))
      const result = { url, stage, ...data }
      results.push(result)
      console.log(JSON.stringify(result))
      await page.screenshot({ path: `${output}/${new URL(url).port}-${stage}.png` })
    }
    await page.mouse.move(1350, 800)
    await page.waitForTimeout(1500)
    await capture('preview')
    await page.locator('#skills').scrollIntoViewIfNeeded()
    await page.waitForTimeout(10000)
    await capture('after-leaving')
    if (errors.length) throw new Error(errors.join('\n'))
    await context.close()
  }
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ browser: browser.version(), results }, null, 2))
  await browser.close()
}
