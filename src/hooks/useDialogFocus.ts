import { useEffect, type RefObject } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function useDialogFocus(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return undefined

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFirst = () => {
      const dialog = dialogRef.current
      const first = dialog?.querySelector<HTMLElement>(focusableSelector)
      ;(first ?? dialog)?.focus()
    }
    const frame = window.requestAnimationFrame(focusFirst)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.offsetParent !== null)
      if (focusables.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      opener?.focus()
    }
  }, [dialogRef, enabled, onClose])
}
