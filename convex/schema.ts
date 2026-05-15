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

    // Manual click acceptance window (seconds): manual top/relai click within X sec of an auto lap REPLACES it
    replaceAutoWindowSec: v.optional(v.number()),

    // Physical lap time bounds (seconds) — used by form validation. Defaults: 165 (2:45) and 480 (8:00).
    minLapSec: v.optional(v.number()),
    maxLapSec: v.optional(v.number()),

    // Max runners per team (uniform across all teams of this event). Default 10.
    maxRunnersPerTeam: v.optional(v.number()),

    // Geolocation for weather forecast lookup (Met.no). Optional — UI hides
    // weather widgets when missing. Validated client-side: -90..90 / -180..180.
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),

    // Display name of the city/location associated with lat/lng (free text).
    // Shown on the weather banner ("Brette les Pins · Prochaines 6h: …").
    cityName: v.optional(v.string()),

    // Relay transition penalty in seconds (default 5s). Applied to expected lap
    // time when a tour is type relay_*, both for cumulative team delta computation
    // and (later) for auto-pass scheduling penalty.
    relayTransitionSec: v.optional(v.number()),
    
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
    // DEPRECATED: per-team capacity. Source of truth is event.maxRunnersPerTeam.
    // Kept optional during transition to avoid breaking existing data.
    maxRunners: v.optional(v.number()),
    ready: v.boolean(), // marked as ready for race start
    autoPaused: v.optional(v.boolean()), // when true, cron skips auto laps for this team until next manual action
    cronCooldownUntil: v.optional(v.number()), // timestamp until which cron autoTick must skip this team (set after manual record)
    
    // Profile image (optional)
    profileImage: v.optional(v.string()), // URL to team profile image
    
    // Contact info
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    
    // Race state
    currentIdx: v.number(), // current runner index in order

    // Group-relay mode queue — head = active/pending entry; rest = upcoming entries
    groupModeQueue: v.optional(v.array(v.object({
      groupName: v.string(),
      remainingRelays: v.number(),
      status: v.union(v.literal('active'), v.literal('pending')),
    }))),

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
    gender: v.optional(v.string()), // 'Homme' | 'Femme' | 'Autre'

    // Optional sub-group membership ('A', 'B', 'Nuit', etc.) — used by group-relay mode
    group: v.optional(v.string()),

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

    // Manual override: marks this manual checkpoint as an "extra lap" (tour +) regardless of position-in-relay
    forcedExtra: v.optional(v.boolean()),

    // Bulk relay flag — values are user-declared approximations (watch precision)
    approximate: v.optional(v.boolean()),

    // Snapshot to support clean undo: team.currentIdx BEFORE this lap was inserted
    prevCurrentIdx: v.optional(v.number()),

    // Snapshot of runner.plannedLaps at insert time — used to detect tour +/- vs the planned count at relay start
    plannedAtStart: v.optional(v.number()),

    // If this lap REPLACED a previous (auto) lap, store enough to re-insert it on undo
    replaces: v.optional(v.object({
      runnerId: v.string(),
      timestamp: v.number(),
      lapTime: v.number(),
      type: v.string(),
      lapNumber: v.number(),
      autoRelay: v.optional(v.boolean()),
      prevCurrentIdx: v.optional(v.number()),
    })),

    // Snapshot of team.groupModeQueue BEFORE this lap was inserted (for clean undo of group-mode decrements)
    prevGroupModeQueue: v.optional(v.array(v.object({
      groupName: v.string(),
      remainingRelays: v.number(),
      status: v.union(v.literal('active'), v.literal('pending')),
    }))),

    // Marks the FIRST lap of a runner just after a relay → auto-pass + GPS marker UI must
    // wait an additional offset (relayTransitionMsApplied snapshot) before firing/moving.
    isFirstAfterRelay: v.optional(v.boolean()),
    relayTransitionMsApplied: v.optional(v.number()),
  })
    .index('by_team', ['teamId'])
    .index('by_team_runner', ['teamId', 'runnerId'])
    .index('by_timestamp', ['timestamp'])
    .index('by_lap_id', ['id']),

  // Weather cache (hourly forecast per event + provider). TTL ~1h.
  // provider is optional for backward compatibility; legacy rows w/o provider
  // are treated as 'open-meteo' and re-fetched on next access.
  weather_cache: defineTable({
    eventId: v.id('events'),
    provider: v.optional(v.string()), // 'open-meteo' | 'met-no' | 'meteo-france'
    fetchedAt: v.number(),
    expiresAt: v.number(),
    // Normalized payload: { time: number[] (ms epoch), temperature_2m, relative_humidity_2m,
    // weather_code, precipitation_probability, timezone, latitude, longitude }
    data: v.any(),
  })
    .index('by_event', ['eventId'])
    .index('by_event_provider', ['eventId', 'provider']),

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