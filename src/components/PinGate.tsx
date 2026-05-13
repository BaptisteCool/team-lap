import React, { useEffect, useRef, useState } from 'react'

interface PinGateProps {
  title: string
  hint?: string
  expected: string
  onUnlock: () => void
  onCancel?: () => void
  numeric?: boolean
  label?: string
  minLength?: number
}

export function PinGate({
  title,
  hint,
  expected,
  onUnlock,
  onCancel,
  numeric = true,
  label,
  minLength = 4,
}: PinGateProps) {
  const [value, setValue] = useState('')
  const [err, setErr] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  function submit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (value === expected) {
      setErr(false)
      onUnlock()
    } else {
      setErr(true)
      setTimeout(() => setErr(false), 800)
    }
  }

  return (
    <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: 'calc(100vh - 70px)' }}>
      <form onSubmit={submit} className="card" style={{ maxWidth: 380, width: '100%' }}>
        <div className="card-head">
          <span>🔒</span>
          <h3>{title}</h3>
        </div>
        <div className="card-body grid" style={{ gap: 14 }}>
          {hint && <div className="hint">{hint}</div>}
          <div className="field">
            <span className="field-label">{label || (numeric ? 'Code PIN' : 'Mot de passe')}</span>
            <input
              ref={inputRef}
              type="password"
              inputMode={numeric ? 'numeric' : 'text'}
              pattern={numeric ? '[0-9]*' : undefined}
              maxLength={numeric ? 8 : 64}
              value={value}
              onChange={e => setValue(numeric ? e.target.value.replace(/\D/g, '') : e.target.value)}
              className={numeric ? 'mono' : ''}
              style={
                numeric
                  ? {
                      fontSize: 22,
                      letterSpacing: '0.4em',
                      textAlign: 'center',
                      borderColor: err ? 'var(--danger)' : undefined,
                    }
                  : { fontSize: 16, borderColor: err ? 'var(--danger)' : undefined }
              }
              placeholder={numeric ? '••••' : '••••••••'}
              autoComplete="off"
            />
            {err && (
              <span className="hint" style={{ color: 'var(--danger)' }}>
                {numeric ? 'Code incorrect' : 'Mot de passe incorrect'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {onCancel && (
              <button type="button" className="btn ghost" onClick={onCancel}>
                ← Retour
              </button>
            )}
            <button
              type="submit"
              className="btn primary"
              style={{ marginLeft: 'auto' }}
              disabled={value.length < minLength}
            >
              ✓ Valider
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}