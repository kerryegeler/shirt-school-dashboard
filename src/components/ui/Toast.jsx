import { createContext, useCallback, useContext, useRef, useState } from 'react'

// App-wide toast system with optional Undo.
//
// Setup (App.jsx):   <ToastProvider> ... </ToastProvider>
// In any component:  const toast = useToast()
//   toast.show('Draft saved')
//   toast.show('24 emails archived', { variant: 'success', undo: () => restore() })
//
// Toasts auto-dismiss after 4s (8s when an undo action is attached).

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message, { variant = 'default', undo = null } = {}) => {
    const id = ++idRef.current
    setToasts((prev) => [...prev.slice(-2), { id, message, variant, undo }])
    setTimeout(() => dismiss(id), undo ? 8000 : 4000)
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.variant !== 'default' ? `toast--${t.variant}` : ''}`}>
              <span>{t.message}</span>
              {t.undo && (
                <button
                  className="toast-undo-btn"
                  onClick={() => { t.undo(); dismiss(t.id) }}
                >
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  // Components render fine without a provider (e.g. in isolation) — calls become no-ops
  return ctx || { show: () => {}, dismiss: () => {} }
}
