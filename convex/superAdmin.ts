import { ConvexError, v } from 'convex/values'
import { query } from './_generated/server'

// Validate the SUPER_ADMIN_PIN env var (Convex environment variable).
// Set via: npx convex env set SUPER_ADMIN_PIN <value>
// Returns { ok: boolean } — never reveals the expected PIN.
export const validateSuperAdminPin = query({
  args: { pin: v.string() },
  handler: async (_ctx, args) => {
    const expected = process.env.SUPER_ADMIN_PIN
    if (!expected) throw new ConvexError('PIN_NOT_CONFIGURED')
    return { ok: args.pin === expected }
  },
})
