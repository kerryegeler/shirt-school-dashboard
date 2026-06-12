import { useEffect, useRef } from 'react'

// The one modal shell for the whole app. Backdrop click + Escape close it,
// focus moves inside on open and returns on close, body scroll locks, and on
// mobile it goes fullscreen with safe-area padding (see .ui-modal in index.css).
//
// Usage:
//   <Modal title="Live Event Info" onClose={...} footer={<>buttons</>} wide>
//     body content
//   </Modal>
export default function Modal({ title, onClose, children, footer, wide = false, closeDisabled = false }) {
  const modalRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement

    function onKeyDown(e) {
      if (e.key === 'Escape' && !closeDisabled) {
        e.stopPropagation()
        onClose?.()
        return
      }
      // Minimal focus trap: keep Tab cycling inside the modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the modal
    const focusables = modalRef.current?.querySelectorAll('button, input, select, textarea')
    if (focusables?.length) focusables[0].focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      previousFocusRef.current?.focus?.()
    }
  }, [onClose, closeDisabled])

  return (
    <div className="ui-modal-overlay" onClick={() => !closeDisabled && onClose?.()}>
      <div
        className={`ui-modal ${wide ? 'ui-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="ui-modal-header">
            <h3>{title}</h3>
            <button className="ui-modal-close" onClick={onClose} disabled={closeDisabled} aria-label="Close">
              ✕
            </button>
          </div>
        )}
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
