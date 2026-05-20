import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v3'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '../../convex/hooks'
import { Modal } from '../Modal'
import { createEventSchema } from '../../lib/schemas/event'
import { slugify } from '../../lib/slugify'
import { useDebouncedValue } from '../../lib/useDebouncedValue'

function toTimestamp(datetimeLocal: string): number {
  return new Date(datetimeLocal).getTime()
}

function toDatetimeLocal(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getDefaultStart(): string {
  const now = new Date()
  now.setMinutes(0, 0, 0)
  now.setHours(now.getHours() + 1)
  return toDatetimeLocal(now.getTime())
}

function getDefaultEnd(): string {
  const now = new Date()
  now.setMinutes(0, 0, 0)
  now.setHours(now.getHours() + 25)
  return toDatetimeLocal(now.getTime())
}

function getSuperAdminPin(): string | null {
  try {
    return sessionStorage.getItem('superAdminPin')
  } catch (_) {
    return null
  }
}

const formSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Format invalide (lettres minuscules, chiffres, tirets)'),
  scheduledStart: z.string().min(1, 'Date requise'),
  scheduledEnd: z.string().min(1, 'Date requise'),
}).refine(
  data => toTimestamp(data.scheduledEnd) > toTimestamp(data.scheduledStart),
  { message: 'La date de fin doit etre apres la date de debut', path: ['scheduledEnd'] },
)

type FormFields = z.infer<typeof formSchema>

type CreateEventDialogProps = {
  onClose: () => void
}

export function CreateEventDialog({ onClose }: CreateEventDialogProps) {
  const navigate = useNavigate()
  const createMutation = useMutation('events:create' as any)

  const [slugManual, setSlugManual] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Array<{ id: string; text: string }>>([])

  const pushToast = (text: string) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(s => [...s, { id, text }])
    setTimeout(() => setToasts(s => s.filter(t => t.id !== id)), 4000)
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<FormFields>({
    mode: 'onChange',
    defaultValues: {
      name: '',
      slug: '',
      scheduledStart: getDefaultStart(),
      scheduledEnd: getDefaultEnd(),
    },
    resolver: zodResolver(formSchema),
  })

  const watchedName = watch('name')
  const watchedSlug = watch('slug')
  const debouncedSlug = useDebouncedValue(watchedSlug, 300)

  const slugCheckResult = useQuery(
    'events:getBySlug' as any,
    debouncedSlug && /^[a-z0-9-]+$/.test(debouncedSlug)
      ? { slug: debouncedSlug }
      : 'skip',
  ) as { _id: string } | null | undefined

  const slugConflict = slugCheckResult !== null && slugCheckResult !== undefined

  const prevNameRef = useRef('')
  useEffect(() => {
    if (slugManual) return
    const trimmed = watchedName.trim()
    if (trimmed === prevNameRef.current) return
    prevNameRef.current = trimmed
    const generated = slugify(trimmed)
    setValue('slug', generated, { shouldValidate: true })
  }, [watchedName, slugManual, setValue])

  const onSubmit = async (data: FormFields) => {
    if (slugConflict) {
      setServerError('Ce slug est deja utilise')
      return
    }
    const pin = getSuperAdminPin()
    if (!pin) {
      setServerError('Session expiree — rechargez la page et reconnectez-vous')
      return
    }

    const start = toTimestamp(data.scheduledStart)
    const end = toTimestamp(data.scheduledEnd)

    const parsed = createEventSchema.safeParse({
      name: data.name,
      slug: data.slug,
      scheduledStart: start,
      scheduledEnd: end,
    })

    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Validation echouee'
      setServerError(msg)
      return
    }

    setSubmitting(true)
    setServerError(null)

    try {
      await createMutation({
        name: parsed.data.name,
        slug: parsed.data.slug,
        scheduledStart: parsed.data.scheduledStart,
        scheduledEnd: parsed.data.scheduledEnd,
        superAdminPin: pin,
      })

      onClose()
      navigate({ to: '/event/$eventSlug/admin', params: { eventSlug: parsed.data.slug } })
    } catch (err: any) {
      const msg: string = err?.data?.message ?? err?.message ?? 'Erreur serveur'
      const friendly = msg === 'SLUG_CONFLICT' || msg.includes('SLUG_CONFLICT')
        ? 'Ce slug est deja utilise'
        : msg === 'Unauthorized' || msg.includes('Unauthorized')
        ? 'PIN invalide — reconnectez-vous'
        : msg
      setServerError(friendly)
      pushToast(friendly)
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = isValid && !submitting && !slugConflict

  return (
    <>
      <Modal
        title="Nouvel event"
        onClose={onClose}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={onClose} disabled={submitting}>
              Annuler
            </button>
            <button
              className="btn primary"
              onClick={handleSubmit(onSubmit)}
              disabled={!canSubmit}
            >
              {submitting ? 'Creation...' : 'Creer'}
            </button>
          </div>
        }
      >
        <div className="grid" style={{ gap: 14 }}>
          <div className="field">
            <label className="field-label" htmlFor="ev-name">Nom</label>
            <input
              id="ev-name"
              type="text"
              placeholder="24h de la ville 2026"
              autoComplete="off"
              {...register('name')}
            />
            {errors.name && (
              <span className="hint" style={{ color: 'var(--danger)' }}>{errors.name.message}</span>
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="ev-slug">Slug (URL)</label>
            <input
              id="ev-slug"
              type="text"
              placeholder="24h-de-la-ville-2026"
              autoComplete="off"
              className="mono"
              {...register('slug', {
                onChange: () => setSlugManual(true),
              })}
            />
            {errors.slug && (
              <span className="hint" style={{ color: 'var(--danger)' }}>{errors.slug.message}</span>
            )}
            {!errors.slug && slugConflict && watchedSlug && (
              <span className="hint" style={{ color: 'var(--danger)' }}>Ce slug est deja utilise</span>
            )}
            {!errors.slug && !slugConflict && debouncedSlug && slugCheckResult === null && /^[a-z0-9-]+$/.test(debouncedSlug) && (
              <span className="hint" style={{ color: 'oklch(0.86 0.20 135)' }}>Slug disponible</span>
            )}
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label className="field-label" htmlFor="ev-start">Debut</label>
              <input
                id="ev-start"
                type="datetime-local"
                {...register('scheduledStart')}
              />
              {errors.scheduledStart && (
                <span className="hint" style={{ color: 'var(--danger)' }}>{errors.scheduledStart.message}</span>
              )}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="ev-end">Fin</label>
              <input
                id="ev-end"
                type="datetime-local"
                {...register('scheduledEnd')}
              />
              {errors.scheduledEnd && (
                <span className="hint" style={{ color: 'var(--danger)' }}>{errors.scheduledEnd.message}</span>
              )}
            </div>
          </div>

          {serverError && (
            <div
              className="hint"
              style={{
                color: 'var(--danger)',
                padding: '10px 12px',
                background: 'oklch(0.72 0.21 25 / 0.08)',
                border: '1px solid oklch(0.72 0.21 25 / 0.3)',
                borderRadius: 8,
              }}
            >
              {serverError}
            </div>
          )}
        </div>
      </Modal>

      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <span className="toast-icon">!</span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </>
  )
}
