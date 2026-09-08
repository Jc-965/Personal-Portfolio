/**
 * Connects Background.tsx to a renderer without it caring where the renderer
 * runs. Preferred: a worker drawing on an OffscreenCanvas. Fallback: the
 * renderer module loaded inline on the main thread.
 *
 * A canvas can hand control to a worker exactly once, so the hand-off waits
 * for the worker to report that it is ready; if it fails first, the untouched
 * canvas goes to the inline renderer instead.
 */
import type { BackgroundMessage, WorkerInit } from './protocol.ts'
import type { BackgroundRenderer, RendererCanvas, RendererOptions } from './renderer.ts'

export interface RendererLink {
  /** True while frames come from a worker rather than this thread. */
  readonly worker: boolean
  post(message: BackgroundMessage, transfer?: Transferable[]): void
  dispose(): void
}

/** The slice of Worker the link uses, so tests can stand in a fake. */
export interface WorkerPort {
  postMessage(message: unknown, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

export interface RendererModule {
  createBackgroundRenderer(canvas: RendererCanvas, options: RendererOptions): BackgroundRenderer | null
  applyMessage(renderer: BackgroundRenderer, message: BackgroundMessage): void
}

export type LinkCanvas = RendererCanvas & { transferControlToOffscreen?: () => OffscreenCanvas }

export interface LinkOptions {
  reducedMotion: boolean
  /** Spawns the worker, or returns null when the browser cannot run one. */
  spawnWorker: () => WorkerPort | null
  loadRenderer: () => Promise<RendererModule>
}

interface Outgoing {
  message: BackgroundMessage
  transfer: Transferable[]
}

function linkInline(canvas: LinkCanvas, reducedMotion: boolean, loadRenderer: () => Promise<RendererModule>): RendererLink {
  let renderer: BackgroundRenderer | null = null
  let module: RendererModule | null = null
  let queued: BackgroundMessage[] = []
  let disposed = false
  loadRenderer().then((loaded) => {
    if (disposed) return
    module = loaded
    renderer = loaded.createBackgroundRenderer(canvas, { reducedMotion })
    if (!renderer) return
    for (const message of queued) loaded.applyMessage(renderer, message)
    queued = []
  })
  return {
    worker: false,
    post(message) {
      if (renderer && module) module.applyMessage(renderer, message)
      else queued.push(message)
    },
    dispose() {
      disposed = true
      renderer?.dispose()
    },
  }
}

export function createRendererLink(canvas: LinkCanvas, options: LinkOptions): RendererLink {
  const { reducedMotion, loadRenderer } = options
  let worker: WorkerPort | null = null
  if (!reducedMotion && typeof canvas.transferControlToOffscreen === 'function') {
    try {
      worker = options.spawnWorker()
    } catch {
      worker = null
    }
  }
  if (!worker) return linkInline(canvas, reducedMotion, loadRenderer)

  const port = worker
  let ready = false
  let fallback: RendererLink | null = null
  let queued: Outgoing[] = []

  const abandon = () => {
    if (ready || fallback) return
    port.terminate()
    fallback = linkInline(canvas, reducedMotion, loadRenderer)
    for (const entry of queued) fallback.post(entry.message, entry.transfer)
    queued = []
  }

  port.onmessage = (event) => {
    const data = event.data as { type?: string } | null
    if (ready || fallback || !data) return
    if (data.type === 'unsupported') {
      abandon()
      return
    }
    if (data.type !== 'ready') return
    let offscreen: OffscreenCanvas
    try {
      offscreen = canvas.transferControlToOffscreen!()
    } catch {
      abandon()
      return
    }
    ready = true
    const init: WorkerInit = { type: 'init', canvas: offscreen, reducedMotion: false }
    port.postMessage(init, [offscreen])
    for (const entry of queued) port.postMessage(entry.message, entry.transfer)
    queued = []
  }
  port.onerror = abandon

  return {
    get worker() {
      return fallback === null
    },
    post(message, transfer = []) {
      if (fallback) fallback.post(message, transfer)
      else if (ready) port.postMessage(message, transfer)
      else queued.push({ message, transfer })
    },
    dispose() {
      if (fallback) fallback.dispose()
      else port.terminate()
    },
  }
}

// React StrictMode mounts, unmounts and remounts effects in one go. The link
// survives that: disposal is deferred a tick and cancelled if the same canvas
// is acquired again before it fires.
const links = new WeakMap<LinkCanvas, { link: RendererLink; disposeTimer: ReturnType<typeof setTimeout> | null }>()

export function acquireLink(canvas: LinkCanvas, options: LinkOptions): RendererLink {
  const existing = links.get(canvas)
  if (existing) {
    if (existing.disposeTimer !== null) clearTimeout(existing.disposeTimer)
    existing.disposeTimer = null
    return existing.link
  }
  const link = createRendererLink(canvas, options)
  links.set(canvas, { link, disposeTimer: null })
  return link
}

export function releaseLink(canvas: LinkCanvas) {
  const entry = links.get(canvas)
  if (!entry) return
  if (entry.disposeTimer !== null) clearTimeout(entry.disposeTimer)
  entry.disposeTimer = setTimeout(() => {
    links.delete(canvas)
    entry.link.dispose()
  }, 0)
}
