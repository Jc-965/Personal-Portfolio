// Component ported and enhanced from https://codepen.io/JuanFuentes/pen/eYEeoyE

import { useRef, useEffect } from 'react'
import * as THREE from 'three'

const vertexShader = `
varying vec2 vUv;
uniform float uTime;
uniform float mouse;
uniform float uEnableWaves;

void main() {
    vUv = uv;
    float time = uTime * 5.;

    float waveFactor = uEnableWaves;

    vec3 transformed = position;

    transformed.x += sin(time + position.y) * 0.32 * waveFactor;
    transformed.y += cos(time + position.z) * 0.12 * waveFactor;
    transformed.z += sin(time + position.x) * 0.6 * waveFactor;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`

const fragmentShader = `
varying vec2 vUv;
uniform float mouse;
uniform float uTime;
uniform sampler2D uTexture;

void main() {
    gl_FragColor = texture2D(uTexture, vUv);
}
`

function map(n: number, start: number, stop: number, start2: number, stop2: number) {
  return ((n - start) / (stop - start)) * (stop2 - start2) + start2
}

const PX_RATIO = typeof window !== 'undefined' ? window.devicePixelRatio : 1
const ASCII_IDLE_FRAME_INTERVAL_MS = 1000 / 24
const ASCII_ACTIVE_WINDOW_MS = 140
const ASCII_RESIZE_COOLDOWN_MS = 120
const ASCII_RESIZE_DEBOUNCE_MS = 140

interface AsciiFilterOptions {
  fontSize?: number
  fontFamily?: string
  charset?: string
  invert?: boolean
}

class AsciiFilter {
  renderer!: THREE.WebGLRenderer
  domElement: HTMLDivElement
  pre: HTMLPreElement
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D | null
  deg: number
  invert: boolean
  fontSize: number
  fontFamily: string
  charset: string
  width = 0
  height = 0
  center = { x: 0, y: 0 }
  mouse = { x: 0, y: 0 }
  cols = 0
  rows = 0
  frameCount = 0
  lastAsciiStr = ''
  lastRenderTime = 0
  lastInputTime = 0
  resizeCooldownUntil = 0

  constructor(renderer: THREE.WebGLRenderer, { fontSize, fontFamily, charset, invert }: AsciiFilterOptions = {}) {
    this.renderer = renderer
    this.domElement = document.createElement('div')
    this.domElement.style.position = 'absolute'
    this.domElement.style.top = '0'
    this.domElement.style.left = '0'
    this.domElement.style.width = '100%'
    this.domElement.style.height = '100%'

    this.pre = document.createElement('pre')
    this.domElement.appendChild(this.pre)

    this.canvas = document.createElement('canvas')
    this.context = this.canvas.getContext('2d', { willReadFrequently: true })
    this.domElement.appendChild(this.canvas)

    this.deg = 0
    this.invert = invert ?? true
    this.fontSize = fontSize ?? 12
    this.fontFamily = fontFamily ?? "'Courier New', monospace"
    this.charset = charset ?? ' .:-=+*#%@'

    if (this.context) {
      this.context.imageSmoothingEnabled = false
      this.context.imageSmoothingEnabled = false
    }

    this.onMouseMove = this.onMouseMove.bind(this)
    document.addEventListener('mousemove', this.onMouseMove)
  }

  setSize(width: number, height: number) {
    this.width = width
    this.height = height
    this.renderer.setSize(width, height, false)
    this.reset()
    this.pauseForResize()

    this.center = { x: width / 2, y: height / 2 }
    this.mouse = { x: this.center.x, y: this.center.y }
  }

  pauseForResize() {
    this.resizeCooldownUntil = performance.now() + ASCII_RESIZE_COOLDOWN_MS
    this.lastRenderTime = 0
  }

  reset() {
    if (this.context) {
      this.context.font = `${this.fontSize}px ${this.fontFamily}`
      const charWidth = this.context.measureText('A').width

      this.cols = Math.max(1, Math.floor(this.width / (this.fontSize * (charWidth / this.fontSize))))
      this.rows = Math.max(1, Math.floor(this.height / this.fontSize))

      this.canvas.width = this.cols
      this.canvas.height = this.rows
      this.pre.style.fontFamily = this.fontFamily
      this.pre.style.fontSize = `${this.fontSize}px`
      this.pre.style.margin = '0'
      this.pre.style.padding = '0'
      this.pre.style.lineHeight = '1em'
      this.pre.style.position = 'absolute'
      this.pre.style.left = '0'
      this.pre.style.top = '0'
      this.pre.style.zIndex = '9'
      this.pre.style.backgroundAttachment = 'fixed'
      this.pre.style.mixBlendMode = 'difference'
      this.pre.style.whiteSpace = 'pre'
      this.pre.style.letterSpacing = '0'
      this.canvas.style.display = 'none'
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera, now: number) {
    this.hue()

    if (now < this.resizeCooldownUntil) return

    const w = this.canvas.width
    const h = this.canvas.height
    if (w <= 0 || h <= 0) return

    const frameInterval = now - this.lastInputTime < ASCII_ACTIVE_WINDOW_MS ? 0 : ASCII_IDLE_FRAME_INTERVAL_MS
    const canReuseFrame = frameInterval > 0 && this.lastAsciiStr && now - this.lastRenderTime < frameInterval
    if (canReuseFrame) return

    this.renderer.render(scene, camera)
    if (this.context) {
      this.context.clearRect(0, 0, w, h)
      this.context.drawImage(this.renderer.domElement, 0, 0, w, h)
      this.asciify(this.context, w, h)
      this.lastRenderTime = now
    }
  }

  onMouseMove(e: MouseEvent) {
    this.mouse = { x: e.clientX * PX_RATIO, y: e.clientY * PX_RATIO }
    this.lastInputTime = performance.now()
  }

  get dx() {
    return this.mouse.x - this.center.x
  }

  get dy() {
    return this.mouse.y - this.center.y
  }

  hue() {
    const deg = (Math.atan2(this.dy, this.dx) * 180) / Math.PI
    this.deg += (deg - this.deg) * 0.075
    this.domElement.style.filter = `hue-rotate(${this.deg.toFixed(1)}deg)`
  }

  asciify(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const imgData = ctx.getImageData(0, 0, w, h).data
    const charLen = this.charset.length - 1
    const parts: string[] = []
    for (let y = 0; y < h; y++) {
      const rowStart = y * 4 * w
      for (let x = 0; x < w; x++) {
        const i = x * 4 + rowStart
        const a = imgData[i + 3]

        if (a === 0) {
          parts.push(' ')
          continue
        }

        const gray = (0.3 * imgData[i] + 0.6 * imgData[i + 1] + 0.1 * imgData[i + 2]) / 255
        let idx = Math.floor((1 - gray) * charLen)
        if (this.invert) idx = charLen - idx
        parts.push(this.charset[idx])
      }
      parts.push('\n')
    }
    const str = parts.join('')
    this.lastAsciiStr = str
    this.pre.textContent = str
  }

  dispose() {
    document.removeEventListener('mousemove', this.onMouseMove)
  }
}

interface CanvasTxtOptions {
  fontSize?: number
  fontFamily?: string
  color?: string
}

class CanvasTxt {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D | null
  txt: string
  fontSize: number
  fontFamily: string
  color: string
  font: string

  constructor(txt: string, { fontSize = 200, fontFamily = 'Arial', color = '#fdf9f3' }: CanvasTxtOptions = {}) {
    this.canvas = document.createElement('canvas')
    this.context = this.canvas.getContext('2d')
    this.txt = txt
    this.fontSize = fontSize
    this.fontFamily = fontFamily
    this.color = color

    this.font = `600 ${this.fontSize}px ${this.fontFamily}`
  }

  resize() {
    if (this.context) {
      this.context.font = this.font
      const metrics = this.context.measureText(this.txt)

      const textWidth = Math.ceil(metrics.width) + 20
      const textHeight = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + 20

      this.canvas.width = textWidth
      this.canvas.height = textHeight
    }
  }

  render() {
    if (this.context) {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
      this.context.fillStyle = this.color
      this.context.font = this.font

      const metrics = this.context.measureText(this.txt)
      const yPos = 10 + metrics.actualBoundingBoxAscent

      this.context.fillText(this.txt, 10, yPos)
    }
  }

  get width() {
    return this.canvas.width
  }

  get height() {
    return this.canvas.height
  }

  get texture() {
    return this.canvas
  }
}

interface CanvAsciiOptions {
  text: string
  asciiFontSize: number
  textFontSize: number
  textColor: string
  planeBaseHeight: number
  enableWaves: boolean
  interactionMode: 'local' | 'viewport'
}

class CanvAscii {
  textString: string
  asciiFontSize: number
  textFontSize: number
  textColor: string
  planeBaseHeight: number
  container: HTMLElement
  width: number
  height: number
  enableWaves: boolean
  interactionMode: 'local' | 'viewport'
  camera: THREE.PerspectiveCamera
  scene: THREE.Scene
  mouse: { x: number; y: number }
  textCanvas!: CanvasTxt
  texture!: THREE.CanvasTexture
  geometry: THREE.PlaneGeometry | undefined
  material: THREE.ShaderMaterial | undefined
  mesh!: THREE.Mesh
  textAspect = 1
  renderer!: THREE.WebGLRenderer
  filter!: AsciiFilter
  center = { x: 0, y: 0 }
  animationFrameId = 0
  isVisible = true

  constructor(
    { text, asciiFontSize, textFontSize, textColor, planeBaseHeight, enableWaves, interactionMode }: CanvAsciiOptions,
    containerElem: HTMLElement,
    width: number,
    height: number
  ) {
    this.textString = text
    this.asciiFontSize = asciiFontSize
    this.textFontSize = textFontSize
    this.textColor = textColor
    this.planeBaseHeight = planeBaseHeight
    this.container = containerElem
    this.width = width
    this.height = height
    this.enableWaves = enableWaves
    this.interactionMode = interactionMode

    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 1, 1000)
    this.camera.position.z = 30

    this.scene = new THREE.Scene()
    this.mouse = { x: 0.5, y: 0.5 }

    this.onMouseMove = this.onMouseMove.bind(this)
  }

  async init() {
    try {
      await document.fonts.load('600 200px "IBM Plex Mono"')
      await document.fonts.load('500 12px "IBM Plex Mono"')
    } catch (e) {}
    await document.fonts.ready
    this.setMesh()
    this.setRenderer()
  }

  setMesh() {
    this.textCanvas = new CanvasTxt(this.textString, {
      fontSize: this.textFontSize,
      fontFamily: 'IBM Plex Mono',
      color: this.textColor
    })
    this.textCanvas.resize()
    this.textCanvas.render()

    this.texture = new THREE.CanvasTexture(this.textCanvas.texture)
    this.texture.minFilter = THREE.NearestFilter
    this.texture.needsUpdate = true

    this.textAspect = this.textCanvas.width / this.textCanvas.height

    this.geometry = new THREE.PlaneGeometry(1, 1, 36, 36)
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        mouse: { value: 1.0 },
        uTexture: { value: this.texture },
        uEnableWaves: { value: this.enableWaves ? 1.0 : 0.0 }
      }
    })

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.fitMeshToView()
    this.scene.add(this.mesh)
  }

  setRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(1)
    this.renderer.setClearColor(0x000000, 0)

    this.filter = new AsciiFilter(this.renderer, {
      fontFamily: 'IBM Plex Mono',
      fontSize: this.asciiFontSize,
      invert: true
    })

    this.container.appendChild(this.filter.domElement)
    this.setSize(this.width, this.height)

    if (this.interactionMode === 'viewport') {
      window.addEventListener('mousemove', this.onMouseMove)
      window.addEventListener('touchmove', this.onMouseMove)
      return
    }

    this.container.addEventListener('mousemove', this.onMouseMove)
    this.container.addEventListener('touchmove', this.onMouseMove)
  }

  setSize(w: number, h: number) {
    this.width = w
    this.height = h

    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.fitMeshToView()

    this.filter.setSize(w, h)

    this.center = { x: w / 2, y: h / 2 }
  }

  fitMeshToView() {
    if (!this.mesh || !Number.isFinite(this.textAspect) || this.textAspect <= 0) return

    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov)
    const viewHeight = 2 * Math.tan(verticalFov / 2) * this.camera.position.z
    const viewWidth = viewHeight * this.camera.aspect
    const maxPlaneHeight = viewHeight * 0.86
    const maxPlaneWidth = viewWidth * 0.96
    const targetPlaneHeight = Math.min(this.planeBaseHeight, maxPlaneHeight, maxPlaneWidth / this.textAspect)

    this.mesh.scale.set(targetPlaneHeight * this.textAspect, targetPlaneHeight, 1)
  }

  load() {
    this.animate()
  }

  setVisibility(isVisible: boolean) {
    this.isVisible = isVisible
    if (isVisible) {
      this.animate()
    }
  }

  onMouseMove(evt: MouseEvent | TouchEvent) {
    const e = (evt as TouchEvent).touches ? (evt as TouchEvent).touches[0] : (evt as MouseEvent)

    if (this.interactionMode === 'viewport') {
      const viewportWidth = window.innerWidth || 1
      const viewportHeight = window.innerHeight || 1

      this.mouse = {
        x: Math.max(0, Math.min(1, e.clientX / viewportWidth)),
        y: Math.max(0, Math.min(1, e.clientY / viewportHeight))
      }
      return
    }

    const bounds = this.container.getBoundingClientRect()
    const width = bounds.width || 1
    const height = bounds.height || 1

    this.mouse = {
      x: Math.max(0, Math.min(1, (e.clientX - bounds.left) / width)),
      y: Math.max(0, Math.min(1, (e.clientY - bounds.top) / height))
    }
  }

  animate() {
    if (this.animationFrameId) return

    const animateFrame = (now: number) => {
      if (!this.isVisible) {
        this.animationFrameId = 0
        return
      }

      this.animationFrameId = requestAnimationFrame(animateFrame)
      this.render(now * 0.001, now)
    }

    this.animationFrameId = requestAnimationFrame(animateFrame)
  }

  render(time: number, now: number) {
    ;(this.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = Math.sin(time)

    this.updateRotation()
    this.filter.render(this.scene, this.camera, now)
  }

  pauseForResize() {
    this.filter.pauseForResize()
  }

  updateRotation() {
    const x = map(this.mouse.y, 0, 1, 0.5, -0.5)
    const y = map(this.mouse.x, 0, 1, -0.5, 0.5)

    this.mesh.rotation.x += (x - this.mesh.rotation.x) * 0.05
    this.mesh.rotation.y += (y - this.mesh.rotation.y) * 0.05
  }

  clear() {
    this.scene.traverse(object => {
      const obj = object as unknown as THREE.Mesh
      if (!obj.isMesh) return
      ;[obj.material].flat().forEach(material => {
        material.dispose()
        Object.keys(material).forEach(key => {
          const matProp = material[key as keyof typeof material]
          if (matProp && typeof matProp === 'object' && 'dispose' in matProp && typeof matProp.dispose === 'function') {
            matProp.dispose()
          }
        })
      })
      obj.geometry.dispose()
    })
    this.scene.clear()
  }

  dispose() {
    cancelAnimationFrame(this.animationFrameId)
    if (this.filter) {
      this.filter.dispose()
      if (this.filter.domElement.parentNode) {
        this.container.removeChild(this.filter.domElement)
      }
    }
    if (this.interactionMode === 'viewport') {
      window.removeEventListener('mousemove', this.onMouseMove)
      window.removeEventListener('touchmove', this.onMouseMove)
    } else {
      this.container.removeEventListener('mousemove', this.onMouseMove)
      this.container.removeEventListener('touchmove', this.onMouseMove)
    }
    this.clear()
    if (this.renderer) {
      this.renderer.dispose()
    }
    this.animationFrameId = 0
  }
}

interface ASCIITextProps {
  text?: string
  asciiFontSize?: number
  textFontSize?: number
  textColor?: string
  planeBaseHeight?: number
  enableWaves?: boolean
  interactionMode?: 'local' | 'viewport'
}

export default function ASCIIText({
  text = 'David!',
  asciiFontSize = 8,
  textFontSize = 200,
  textColor = '#fdf9f3',
  planeBaseHeight = 8,
  enableWaves = true,
  interactionMode = 'local'
}: ASCIITextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const asciiRef = useRef<CanvAscii | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false
    let sizeObserver: IntersectionObserver | null = null
    let visibilityObserver: IntersectionObserver | null = null
    let ro: ResizeObserver | null = null
    let resizeTimer: ReturnType<typeof setTimeout> | null = null

    const observeVisibility = () => {
      if (!containerRef.current || visibilityObserver) return

      visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          asciiRef.current?.setVisibility(entry.isIntersecting)
        },
        { threshold: 0 }
      )

      visibilityObserver.observe(containerRef.current)
    }

    const createAndInit = async (container: HTMLDivElement, w: number, h: number) => {
      const instance = new CanvAscii(
        { text, asciiFontSize, textFontSize, textColor, planeBaseHeight, enableWaves, interactionMode },
        container,
        w,
        h
      )
      await instance.init()
      return instance
    }

    const mountInstance = async (container: HTMLDivElement, w: number, h: number) => {
      const instance = await createAndInit(container, w, h)
      if (cancelled) {
        instance.dispose()
        return
      }

      asciiRef.current = instance
      observeVisibility()
      instance.load()
    }

    const setup = async () => {
      const { width, height } = containerRef.current!.getBoundingClientRect()

      if (width === 0 || height === 0) {
        sizeObserver = new IntersectionObserver(
          async ([entry]) => {
            if (cancelled) return
            if (entry.isIntersecting && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0) {
              const { width: w, height: h } = entry.boundingClientRect
              sizeObserver?.disconnect()
              sizeObserver = null

              if (!cancelled) {
                await mountInstance(containerRef.current!, w, h)
              }
            }
          },
          { threshold: 0.1 }
        )
        sizeObserver.observe(containerRef.current!)
        return
      }

      await mountInstance(containerRef.current!, width, height)
      if (!cancelled && asciiRef.current) {
        ro = new ResizeObserver(entries => {
          if (!entries[0] || !asciiRef.current) return
          const { width: w, height: h } = entries[0].contentRect
          if (w > 0 && h > 0) {
            asciiRef.current.pauseForResize()
            if (resizeTimer) clearTimeout(resizeTimer)
            resizeTimer = setTimeout(() => {
              asciiRef.current?.setSize(w, h)
            }, ASCII_RESIZE_DEBOUNCE_MS)
          }
        })
        ro.observe(containerRef.current!)
      }
    }

    setup()

    return () => {
      cancelled = true
      if (sizeObserver) sizeObserver.disconnect()
      if (visibilityObserver) visibilityObserver.disconnect()
      if (ro) ro.disconnect()
      if (resizeTimer) clearTimeout(resizeTimer)
      if (asciiRef.current) {
        asciiRef.current.dispose()
        asciiRef.current = null
      }
    }
  }, [text, asciiFontSize, textFontSize, textColor, planeBaseHeight, enableWaves, interactionMode])

  return (
    <div
      ref={containerRef}
      className="ascii-text-container"
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%'
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&display=swap');

        .ascii-text-container canvas {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          image-rendering: optimizeSpeed;
          image-rendering: -moz-crisp-edges;
          image-rendering: -o-crisp-edges;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: optimize-contrast;
          image-rendering: crisp-edges;
          image-rendering: pixelated;
        }

        .ascii-text-container pre {
          margin: 0;
          user-select: none;
          padding: 0;
          line-height: 1em;
          text-align: left;
          position: absolute;
          left: 0;
          top: 0;
          background-image: radial-gradient(circle, #ff6188 0%, #fc9867 50%, #ffd866 100%);
          background-attachment: fixed;
          -webkit-text-fill-color: transparent;
          -webkit-background-clip: text;
          z-index: 9;
          mix-blend-mode: difference;
        }
      `}</style>
    </div>
  )
}
