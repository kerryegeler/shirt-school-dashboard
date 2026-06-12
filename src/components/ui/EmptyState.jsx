// Consistent empty-state block: icon, headline, optional hint + action.
//
//   <EmptyState icon="📭" title="Inbox zero" hint="No emails need your attention.">
//     <button className="btn btn-secondary" onClick={refresh}>Refresh</button>
//   </EmptyState>
export default function EmptyState({ icon = '✨', title, hint, children }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 'var(--sp-2)', padding: 'var(--sp-6) var(--sp-4)', textAlign: 'center', minHeight: 200,
    }}>
      <div style={{ fontSize: 36, opacity: 0.8 }}>{icon}</div>
      <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {hint && <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)', maxWidth: 360 }}>{hint}</div>}
      {children && <div style={{ marginTop: 'var(--sp-3)' }}>{children}</div>}
    </div>
  )
}
