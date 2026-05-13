# Quick Start Guide

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

This will install:
- React and React DOM
- TanStack Router
- Convex
- Tailwind CSS and related packages
- Utility libraries (clsx, tailwind-merge, lucide-react)

### 2. Initialize Convex

```bash
npx convex dev
```

This will:
- Create a new Convex project
- Generate the `convex/_generated` folder
- Create a `.env` file with `VITE_CONVEX_URL`
- Start the Convex dev server

### 3. Start the Development Server

```bash
npm run dev
```

This will:
- Start Vite dev server
- Generate TanStack Router route tree
- Open the app at `http://localhost:5173`

## Project Structure

```
teamlap_hosting/
├── convex/
│   ├── schema.ts          # Database schema
│   └── functions.ts       # Queries & mutations
├── src/
│   ├── lib/
│   │   └── utils.ts       # Utility functions
│   ├── routes/
│   │   ├── __root.tsx     # Root layout
│   │   ├── index.tsx      # Home page (/)
│   │   ├── event.$eventId.tsx  # Event page (/event/:id)
│   │   └── admin.tsx      # Admin page (/admin)
│   ├── main.tsx           # App entry point
│   └── index.css          # Global styles
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Key Features Implemented

### ✅ TanStack Router Configuration
- Type-safe routing with file-based routes
- Routes: `/`, `/event/:eventId`, `/admin`
- Automatic route tree generation

### ✅ Convex Schema
- **Organizations**: Multi-tenant support
- **Events**: Race events with schedule and status
- **Teams**: Team info, PIN access, race state
- **Runners**: Pace configuration, energy levels
- **Laps**: 4 types (checkpoint_manual, relay_manual, checkpoint_auto, relay_auto)
- **Rankings**: Computed rankings with history

### ✅ Convex Functions
- **Mutations**: startRelay, autoValidateLap, validateCheckpoint, validateRelay
- **Queries**: getTeamsByEvent, getTeamByPin, getLapsByTeam, getRunnersByTeam, etc.

### ✅ Auto-validation
- `ctx.scheduler.runAfter` for 900m laps (3-8 min duration)
- Automatic lap validation with type detection
- Auto-relay when planned laps reached

### ✅ Styling
- Tailwind CSS with custom TeamLap theme
- CSS variables for theming
- Custom components (card, btn, badge, etc.)

## Next Steps

### 1. Create Sample Data

After setting up Convex, create sample data via the Convex dashboard or CLI:

```bash
npx convex dashboard
```

### 2. Build Dashboard Component

Create a real-time dashboard using Convex hooks:

```typescript
import { useQuery } from 'convex/react'

function Dashboard() {
  const teams = useQuery(api.functions.getTeamsByEvent, { eventId })
  // teams updates automatically in real-time
}
```

### 3. Add Shadcn UI Components

Install and configure Shadcn UI components:

```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card input
```

### 4. Migrate Existing Screens

Port your existing Firebase RTDB screens to Convex:
- Home screen with team list
- Admin dashboard with race controls
- Team screens (setup, planning, live, history)

### 5. Test Auto-validation

Test the auto-validation flow:
1. Call `startRelay` mutation
2. Wait for scheduled job to execute
3. Verify lap is created with correct type
4. Check auto-relay functionality

## Useful Commands

```bash
# Development
npm run dev              # Start dev server
npx convex dev          # Start Convex dev server

# Building
npm run build           # Build for production
npm run preview         # Preview production build

# Convex
npx convex dashboard    # Open Convex dashboard
npx convex deploy       # Deploy to production
npx convex functions    # List functions
```

## Troubleshooting

### TypeScript Errors

If you see TypeScript errors about missing modules:
```bash
npm install
```

### Convex Connection Issues

If Convex isn't connecting:
1. Check `.env` file has `VITE_CONVEX_URL`
2. Ensure `npx convex dev` is running
3. Verify Convex project is created

### Route Tree Not Generated

If routes aren't working:
1. Ensure `@tanstack/router-plugin/vite` is in `vite.config.ts`
2. Restart dev server
3. Check `src/routeTree.gen.ts` exists

## Documentation

- **README.md** - Project overview and setup
- **ARCHITECTURE.md** - Detailed architecture documentation
- **convex/schema.ts** - Database schema with comments
- **convex/functions.ts** - All Convex functions

## Support

For issues or questions:
- Check Convex docs: https://docs.convex.dev
- Check TanStack Router docs: https://tanstack.com/router
- Check Vite docs: https://vitejs.dev