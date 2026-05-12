import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  // Organizations (multi-tenant support)
  organizations: defineTable({
    name: v.string(),
    slug: v.string(), // URL-friendly identifier
    createdAt: v.number(),
    settings: v.optional(v.object({
      defaultRaceDuration: v.optional(v.number()), // in ms, default 24h
      lapDistance: v.optional(v.number()), // in meters
    })),
  })
    .index('by_slug', ['slug'])
    .index('by_created', ['createdAt']),

  // Events (race events within an organization)
  events: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    
    // Schedule
    scheduledStart: v.optional(v.number()), // timestamp
    scheduledEnd: v.optional(v.number()), // timestamp
    actualStart: v.optional(v.number()), // timestamp when race actually started
    
    // Race state
    status: v.string(), // 'scheduled' | 'running' | 'paused' | 'finished'
    
    // Configuration
    lapDistance: v.number(), // meters
    raceDuration: v.number(), // ms (default 24h)
    
    // Admin settings
    adminPassword: v.string(),
    superAdminPin: v.string(),
    contact: v.optional(v.object({
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
    })),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_slug', ['slug'])
    .index('by_status', ['status']),

  // Interruptions (race and service interruptions)
  interruptions: defineTable({
    eventId: v.id('events'),
    kind: v.string(), // 'race' | 'app'
    reason: v.string(),
    startMs: v.number(),
    endMs: v.optional(v.number()),
  })
    .index('by_event', ['eventId'])
    .index('by_event_kind', ['eventId', 'kind']),

  // Teams
  teams: defineTable({
    eventId: v.id('events'),
    
    // Team info
    name: v.string(),
    pin: v.string(), // 4-digit PIN for team access
    category: v.string(), // 'Hommes' | 'Mixte' | 'Femmes'
    color: v.string(), // hex color
    goalLaps: v.number(), // target laps
    
    // Team configuration
    maxRunners: v.number(),
    ready: v.boolean(), // marked as ready for race start
    
    // Profile image (optional)
    profileImage: v.optional(v.string()), // URL to team profile image
    
    // Contact info
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    
    // Race state
    currentIdx: v.number(), // current runner index in order
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_event', ['eventId'])
    .index('by_pin', ['pin']),

  // Runners
  runners: defineTable({
    teamId: v.id('teams'),
    
    // Runner info
    name: v.string(),
    id: v.string(), // unique ID within team
    
    // Pace configuration (min/km)
    kmMin: v.number(),
    kmSec: v.number(),
    
    // Live pace (updated during race)
    liveKmMin: v.optional(v.number()),
    liveKmSec: v.optional(v.number()),
    
    // Energy level (affects pace estimation)
    energy: v.number(), // 0-100

    // Planning
    plannedLaps: v.number(), // number of laps before relay

    // Display & race state
    color: v.optional(v.string()),
    status: v.optional(v.string()), // 'ready' | 'uncertain' | 'out'

    createdAt: v.number(),
  })
    .index('by_team', ['teamId']),

  // Team runner order (relay sequence)
  teamOrder: defineTable({
    teamId: v.id('teams'),
    order: v.array(v.string()), // array of runner IDs
  })
    .index('by_team', ['teamId']),

  // Laps
  laps: defineTable({
    teamId: v.id('teams'),
    runnerId: v.string(),
    
    // Lap data
    id: v.string(), // unique ID per lap (e.g., 'lap_' + timestamp + '_' + teamId)
    lapNumber: v.number(),
    timestamp: v.number(),
    lapTime: v.number(), // ms
    
    // Lap type - 4 types possibles
    type: v.union(
      v.literal('checkpoint_manual'),  // checkpoint validé manuellement
      v.literal('relay_manual'),        // relay validé manuellement
      v.literal('checkpoint_auto'),     // checkpoint auto-validé
      v.literal('relay_auto')           // relay auto-validé
    ),
    
    // Auto-relay flag (uniquement pour les types auto)
    autoRelay: v.optional(v.boolean()),
  })
    .index('by_team', ['teamId'])
    .index('by_team_runner', ['teamId', 'runnerId'])
    .index('by_timestamp', ['timestamp'])
    .index('by_lap_id', ['id']),

  // Rankings (computed and stored)
  rankings: defineTable({
    eventId: v.id('events'),
    teamId: v.id('teams'),
    
    position: v.number(),
    gapPrev: v.optional(v.string()), // formatted gap
    gapNext: v.optional(v.string()), // formatted gap
    
    // History for tracking position changes
    history: v.array(v.object({
      timestamp: v.number(),
      position: v.number(),
    })),
    
    updatedAt: v.number(),
  })
    .index('by_event', ['eventId'])
    .index('by_event_position', ['eventId', 'position']),
})