import type { PerformanceProfile } from './profile.ts'

/**
 * Everything the main thread tells the renderer. The same messages drive the
 * renderer whether it runs inline or inside the worker, so Background.tsx
 * never needs to know which one it is talking to.
 */
export type BackgroundMessage =
  | { type: 'resize'; width: number; height: number; profile: PerformanceProfile }
  | { type: 'pointer'; x: number; y: number }
  | { type: 'leave' }
  | { type: 'interact'; x: number; y: number }
  | { type: 'end' }
  | { type: 'gyro'; x: number; y: number }
  | { type: 'scroll'; progress: number }
  | { type: 'covered'; covered: boolean }
  | { type: 'hidden'; hidden: boolean }
  | { type: 'noise'; tile: CanvasImageSource | null; scale: number }

/** First and only message the worker receives before the stream above. */
export interface WorkerInit {
  type: 'init'
  canvas: OffscreenCanvas
  reducedMotion: boolean
}
