import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  title: string
  icon?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ title, icon, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
          <h3>{title}</h3>
          <button className="btn ghost icon" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
