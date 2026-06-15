const preloaded = new Set<string>()

export function preloadImage(src: string | undefined) {
  if (!src || preloaded.has(src) || typeof window === 'undefined') return

  preloaded.add(src)
  const img = new Image()
  img.decoding = 'async'
  img.src = src
}

export function preloadImages(srcs: Array<string | undefined>) {
  srcs.forEach(preloadImage)
}
