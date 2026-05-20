import { z } from 'zod/v3'

export const createEventSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Format invalide (lettres minuscules, chiffres, tirets)'),
  scheduledStart: z.number().int(),
  scheduledEnd: z.number().int(),
}).refine(data => data.scheduledEnd > data.scheduledStart, {
  message: 'La date de fin doit etre apres la date de debut',
  path: ['scheduledEnd'],
})

export type CreateEventFormValues = z.infer<typeof createEventSchema>
