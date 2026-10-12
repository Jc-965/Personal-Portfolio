/**
 * The value last written to each element's inline style property or attribute by setStyle. A chapter's overlay
 * and copy ride rewrite every act, label, and leader each frame, and most of them have not moved, so only changed
 * values reach the DOM. Nothing else writes these properties, which keeps the cache true.
 */
const written = new WeakMap<Element, Map<string, string>>()

/** Writes a custom property (--name), the path's d attribute (d), or a camel-case style property, skipping unchanged values. */
export function setStyle(el: HTMLElement | SVGElement, prop: string, value: string) {
  let last = written.get(el)
  if (!last) written.set(el, (last = new Map()))
  if (last.get(prop) === value) return
  last.set(prop, value)
  if (prop === 'd') el.setAttribute('d', value)
  else if (prop.startsWith('--')) el.style.setProperty(prop, value)
  else el.style[prop as 'opacity' | 'transform' | 'strokeDashoffset'] = value
}

export const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
