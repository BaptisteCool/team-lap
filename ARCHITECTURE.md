# TeamLap Architecture Overview

## TanStack Router Configuration

### Root Route (`src/routes/__root.tsx`)

```typescript
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="app">
      <header className="topbar">
        {/* Topbar with navigation */}
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  ),
})
```

The root route provides the layout with the topbar and renders child routes via `<Outlet />`.

### Home Route (`src/routes/index.tsx`)

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomeScreen,
})
```

Accessible at `/` - displays the home screen with team list.

### Event Route (`src/routes/event.$eventId.tsx`)

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/event/$eventId')({
  component: EventScreen,
})
```

Accessible at `/event/:eventId` - displays event tracking with type-safe params:

```typescript
function EventScreen() {
  const { eventId } = Route.useParams()
  // eventId is typed as string
}
```

### Admin Route (`src/routes/admin.tsx`)

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin')({
  component: AdminScreen,
})
```

Accessible at `/admin` - displays the admin dashboard.

### Main Entry Point (`src/main.tsx`)

```typescript
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { routeTree } from './routeTree.gen'

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL || '')
const router = createRouter({ routeTree })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <RouterProvider router={router} />
    </ConvexProvider>
  </React.StrictMode>,
)
```

## Convex Schema

### Organizations Table

```typescript
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
  .index('by_created', ['createdAt'])
```

**Purpose**: Multi-tenant support for managing multiple organizations.

**Indexes**:
- `by_slug`: Fast lookup by URL slug
- `by_created`: Chronological ordering

### Events Table

```typescript
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
  .index('by_status', ['status'])
```

**Purpose**: Race events within an organization.

**Indexes**:
- `by_org`: Get all events for an organization
- `by_slug`: Fast lookup by URL slug
- `by_status`: Filter by race status

### Interruptions Table

```typescript
interruptions: defineTable({
  eventId: v.id('events'),
  kind: v.string(), // 'race' | 'app'
  reason: v.string(),
  startMs: v.number(),
  endMs: v.optional(v.number()),
})
  .index('by_event', ['eventId'])
  .index('by_event_kind', ['eventId', 'kind'])
```

**Purpose**: Track race and service interruptions.

**Indexes**:
- `by_event`: Get all interruptions for an event
- `by_event_kind`: Filter by interruption type

### Teams Table

```typescript
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
  
  // Contact info
  contactName: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
  
  // Race state
  currentIdx: v.number(), // current runner index in order
  
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_event', ['eventId'])
  .index('by_pin', ['pin'])
```

**Purpose**: Teams participating in an event.

**Indexes**:
- `by_event`: Get all teams for an event
- `by_pin`: Fast lookup by PIN for team access

### Runners Table

```typescript
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
  
  createdAt: v.number(),
})
  .index('by_team', ['teamId'])
```

**Purpose**: Runners within a team.

**Indexes**:
- `by_team`: Get all runners for a team

### Team Order Table

```typescript
teamOrder: defineTable({
  teamId: v.id('teams'),
  order: v.array(v.string()), // array of runner IDs
})
  .index('by_team', ['teamId'])
```

**Purpose**: Relay sequence for a team.

**Indexes**:
- `by_team`: Get order for a team

### Laps Table

```typescript
laps: defineTable({
  teamId: v.id('teams'),
  runnerId: v.string(),
  
  // Lap data
  id: v.string(), // unique ID per lap
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
  .index('by_id', ['id'])
```

**Purpose**: Track completed laps with type information.

**Lap Types**:
- `checkpoint_manual`: Manually validated checkpoint
- `relay_manual`: Manually validated relay
- `checkpoint_auto`: Auto-validated checkpoint
- `relay_auto`: Auto-validated relay with runner change

**Indexes**:
- `by_team`: Get all laps for a team
- `by_team_runner`: Get laps for a specific runner
- `by_timestamp`: Chronological ordering
- `by_id`: Fast lookup by unique ID

### Rankings Table

```typescript
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
  .index('by_event_position', ['eventId', 'position'])
```

**Purpose**: Computed rankings with history.

**Indexes**:
- `by_event`: Get all rankings for an event
- `by_event_position`: Get rankings sorted by position

## Convex Functions

### Mutations

#### startRelay
```typescript
export const startRelay = mutation({
  args: {
    teamId: v.id('teams'),
    runnerId: v.string(),
    expectedLapMs: v.number(),
    plannedLaps: v.number(),
  },
  handler: async (ctx, args) => {
    const scheduledId = await ctx.scheduler.runAfter(
      args.expectedLapMs,
      internal.functions.autoValidateLap,
      { /* args */ }
    )
    return { scheduledId }
  },
})
```

**Purpose**: Schedule auto-validation after expected lap time.

#### autoValidateLap
```typescript
export const autoValidateLap = mutation({
  args: {
    teamId: v.id('teams'),
    runnerId: v.string(),
    expectedLapMs: v.number(),
    plannedLaps: v.number(),
  },
  handler: async (ctx, args) => {
    // Count laps since last relay
    // Create virtual lap with type 'checkpoint_auto' or 'relay_auto'
    // Update team.currentIdx if auto-relay
  },
})
```

**Purpose**: Internal scheduled job for auto-validating laps.

#### validateCheckpoint
```typescript
export const validateCheckpoint = mutation({
  args: {
    teamId: v.id('teams'),
    runnerId: v.string(),
    lapTime: v.number(),
  },
  handler: async (ctx, args) => {
    // Create lap with type 'checkpoint_manual'
  },
})
```

**Purpose**: Manually validate a checkpoint.

#### validateRelay
```typescript
export const validateRelay = mutation({
  args: {
    teamId: v.id('teams'),
    runnerId: v.string(),
    lapTime: v.number(),
  },
  handler: async (ctx, args) => {
    // Create lap with type 'relay_manual'
    // Update team.currentIdx
  },
})
```

**Purpose**: Manually validate a relay with runner change.

### Queries

All queries use Convex's real-time sync via `useQuery` hook in React components.

## Real-time Updates with Convex Hooks

```typescript
import { useQuery, useMutation } from 'convex/react'

function Dashboard({ eventId }: { eventId: string }) {
  // Real-time data fetching
  const teams = useQuery(api.functions.getTeamsByEvent, { eventId })
  const eventStatus = useQuery(api.functions.getEventStatus, { eventId })
  
  // Mutations
  const validateCheckpoint = useMutation(api.functions.validateCheckpoint)
  const validateRelay = useMutation(api.functions.validateRelay)
  
  // Data updates automatically when Convex changes
  return (
    <div>
      {/* Display real-time data */}
    </div>
  )
}
```

## Auto-validation Flow

1. **Start Relay**: Call `startRelay` with expected lap time
2. **Schedule**: Convex schedules `autoValidateLap` after `expectedLapMs`
3. **Auto-validate**: Scheduled job creates lap with type `checkpoint_auto` or `relay_auto`
4. **Auto-relay**: If planned laps reached, update `team.currentIdx`

This replaces the need for client-side polling and ensures accurate timing on the server.