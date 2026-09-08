import { useRef } from 'react'
import { useScroll } from 'framer-motion'

type ScrollOffset = NonNullable<Parameters<typeof useScroll>[0]>['offset']

/** Scroll progress of an act: 0 as its top meets the viewport bottom, 1 as its bottom leaves the top, unless `offset` says otherwise. */
export function useActProgress<T extends HTMLElement>(offset: ScrollOffset = ['start end', 'end start']) {
  const ref = useRef<T>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset })
  return { ref, progress: scrollYProgress }
}
