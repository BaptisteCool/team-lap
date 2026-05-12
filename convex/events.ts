import { v } from 'convex/values'
import { query } from './_generated/server'

// List all events
export const list = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query('events').collect()
    return events
  },
})

// Get event by slug
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query('events')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()
    return event
  },
})