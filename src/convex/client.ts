import { ConvexClient } from 'convex/browser'

const convex = new ConvexClient(import.meta.env.VITE_CONVEX_URL!)

export default convex
