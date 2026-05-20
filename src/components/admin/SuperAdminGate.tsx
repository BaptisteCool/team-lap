import { useEffect, useState } from 'react'
import { PinPrompt } from './PinPrompt'

type SuperAdminGateProps = {
  children: React.ReactNode
}

export function SuperAdminGate({ children }: SuperAdminGateProps) {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setAuthed(sessionStorage.getItem('superAdminAuth') === 'ok')
    } catch (_) {
      setAuthed(false)
    }
  }, [])

  if (authed === null) return null
  if (!authed) return <PinPrompt onSuccess={() => setAuthed(true)} />
  return <>{children}</>
}
