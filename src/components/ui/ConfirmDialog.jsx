import Modal from './Modal.jsx'

// Replaces native confirm() so destructive actions get a consistent, styled
// confirmation with an explicit danger treatment.
//
//   <ConfirmDialog
//     title="Archive all emails?"
//     message="This moves 24 inbox emails to the archive."
//     confirmLabel="Archive All"
//     danger
//     onConfirm={...} onCancel={...}
//   />
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, busy = false, onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      closeDisabled={busy}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
    </Modal>
  )
}
