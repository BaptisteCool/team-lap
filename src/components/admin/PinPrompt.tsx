import React, { useEffect, useRef, useState } from 'react'
import { getConvex } from '../../convex/hooks'

type PinPromptProps = {
  onSuccess: () => void
}

export function PinPrompt({ onSuccess }: PinPromptProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (locked || submitting || !pin) return

    setSubmitting(true)
    try {
      const convex = getConvex()
      // Query will be available once split A (back) is deployed.
      // Path: api.superAdmin.validateSuperAdminPin OR api.auth.validateSuperAdminPin
      // Using string-based call to stay flexible until codegen includes the new module.
      const result = await convex.query('superAdmin:validateSuperAdminPin' as any, { pin })
      if ((result as any)?.ok === true) {
        sessionStorage.setItem('superAdminAuth', 'ok')
        sessionStorage.setItem('superAdminPin', pin)
        setError(null)
        onSuccess()
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        setError('PIN invalide')
        if (newAttempts >= 3) {
          setLocked(true)
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          timeoutRef.current = setTimeout(() => {
            setLocked(false)
            setAttempts(0)
            setError(null)
            timeoutRef.current = null
          }, 5000)
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('PIN_NOT_CONFIGURED')) {
        setError("Configuration manquante : contacter l'administrateur système")
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        setError('PIN invalide')
        if (newAttempts >= 3) {
          setLocked(true)
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          timeoutRef.current = setTimeout(() => {
            setLocked(false)
            setAttempts(0)
            setError(null)
            timeoutRef.current = null
          }, 5000)
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: 'calc(100vh - 70px)' }}>
      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 380, width: '100%' }}>
        <div className="card-head">
          <span>🔒</span>
          <h3>Accès super admin</h3>
        </div>
        <div className="card-body grid" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="pin-input" className="field-label">Code PIN</label>
            <input
              id="pin-input"
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              className="mono"
              style={{
                fontSize: 22,
                letterSpacing: '0.4em',
                textAlign: 'center',
                borderColor: error ? 'var(--danger)' : undefined,
              }}
              placeholder="••••"
              autoComplete="off"
              disabled={locked || submitting}
            />
            {error && (
              <span className="hint" aria-live="polite" style={{ color: 'var(--danger)' }}>
                {error}
              </span>
            )}
          </div>
          <button
            type="submit"
            className="btn primary"
            style={{ marginLeft: 'auto' }}
            disabled={locked || submitting || !pin}
          >
            {locked ? 'Patientez 5s...' : submitting ? 'Vérification...' : '✓ Valider'}
          </button>
        </div>
      </form>
    </div>
  )
}
