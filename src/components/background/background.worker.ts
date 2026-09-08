import { applyMessage, createBackgroundRenderer, type BackgroundRenderer } from './renderer.ts'
import type { BackgroundMessage, WorkerInit } from './protocol.ts'

/**
 * Runs the background renderer off the main thread on an OffscreenCanvas.
 * The page keeps ownership of input and layout and streams them here as
 * messages; nothing in this file touches the DOM.
 */
let renderer: BackgroundRenderer | null = null

self.onmessage = (event: MessageEvent<BackgroundMessage | WorkerInit>) => {
  const message = event.data
  if (message.type === 'init') {
    renderer = createBackgroundRenderer(message.canvas, { reducedMotion: message.reducedMotion })
    return
  }
  if (renderer) applyMessage(renderer, message)
}

// The page hands over its canvas only once this thread can pace frames.
const canPaceFrames = typeof requestAnimationFrame === 'function' && typeof OffscreenCanvas !== 'undefined'
self.postMessage({ type: canPaceFrames ? 'ready' : 'unsupported' })
