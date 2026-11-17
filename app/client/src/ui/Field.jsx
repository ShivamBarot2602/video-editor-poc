// Label above a control. `aside` sits right-aligned on the label row (e.g. a value readout).
export default function Field({ label, aside, children }) {
  return (
    <div className="field">
      {aside == null ? (
        <span className="field-label">{label}</span>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span className="field-label">{label}</span>
          {aside}
        </div>
      )}
      {children}
    </div>
  )
}
