import { useAction, useMutation, useQuery } from 'convex/react'
import convex from './client'

// Re-export Convex hooks with our client
export { useAction, useMutation, useQuery }

// Helper to get the convex instance
export const getConvex = () => convex