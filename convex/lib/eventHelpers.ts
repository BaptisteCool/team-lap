import { MutationCtx } from '../_generated/server'
import { Id } from '../_generated/dataModel'

export type CreateEventBaseArgs = {
  organizationId: Id<'organizations'>
  name: string
  slug: string
  scheduledStart: number
  scheduledEnd: number
  lapDistance?: number
  raceDuration?: number
  adminPassword?: string
  superAdminPin?: string
  status?: string
}

export async function createEventWithDefaults(
  ctx: MutationCtx,
  args: CreateEventBaseArgs,
): Promise<Id<'events'>> {
  const now = Date.now()
  return await ctx.db.insert('events', {
    organizationId: args.organizationId,
    name: args.name,
    slug: args.slug,
    scheduledStart: args.scheduledStart,
    scheduledEnd: args.scheduledEnd,
    status: args.status ?? 'scheduled',
    lapDistance: args.lapDistance ?? 900,
    raceDuration: args.raceDuration ?? 24 * 3600 * 1000,
    adminPassword: args.adminPassword ?? '',
    superAdminPin: args.superAdminPin ?? '',
    createdAt: now,
    updatedAt: now,
  })
}
