# TeamLap - 24h Running Race Tracker

A modern, real-time race tracking application for 24-hour running events. Built with Vite, React, TanStack Router, and Convex.

## 🚀 Features

### For Teams
- **Setup Screen**: Configure team members, runners, and estimated paces
- **Planning Screen**: Drag & drop relay ordering with cycle statistics
- **Live Tracker**: Real-time lap recording with automatic validation
- **Progress Tracking**: Live race progress, best laps, and team statistics

### For Administrators
- **Admin Dashboard**: Full race control (start/stop/reset)
- **Team Management**: Create, edit, and delete teams
- **Interruption Tracking**: Log race and service interruptions
- **Password Protection**: Secure admin access with configurable passwords

### Technical Features
- **Real-time Updates**: Live clock and race progress
- **GPX Map Integration**: Interactive circuit map with team positions
- **Responsive Design**: Works on mobile, tablet, and desktop
- **Type-Safe Routing**: TanStack Router with full TypeScript support
- **Convex Backend**: Real-time database with scheduled jobs

## 📦 Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Routing**: TanStack Router (file-based, type-safe)
- **Backend**: Convex (real-time database)
- **Styling**: Tailwind CSS + Custom CSS (800+ lines)
- **UI Components**: Custom components (no external UI library)

## 🛠️ Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## 📁 Project Structure

```
teamlap_hosting/
├── convex/                 # Convex backend
│   ├── schema.ts          # Database schema
│   └── functions.ts       # Queries, mutations, scheduled jobs
├── src/
│   ├── components/        # React components
│   │   ├── GpxMap.tsx    # Interactive circuit map
│   │   ├── HomeScreen.tsx # Landing page
│   │   ├── AdminScreen.tsx # Admin dashboard
│   │   ├── SetupScreen.tsx # Team configuration
│   │   ├── PlanningScreen.tsx # Relay ordering
│   │   ├── LiveScreen.tsx # Real-time tracker
│   │   └── ...           # UI components
│   ├── lib/
│   │   ├── race-data.ts  # Constants & utilities
│   │   └── utils.ts      # Helper functions
│   ├── routes/           # TanStack Router routes
│   │   ├── __root.tsx    # Root layout (topbar)
│   │   ├── index.tsx     # Home page
│   │   ├── admin.tsx     # Admin page
│   │   └── event.$eventId.tsx # Team pages
│   ├── index.css         # Global styles (800+ lines)
│   └── main.tsx          # Entry point
└── package.json
```

## 🎯 Usage

### Home Page (`/`)
- View all registered teams
- See team positions on GPX map
- Access team pages

### Admin Dashboard (`/admin`)
- **Password**: `azerty2026` (default)
- Manage race schedule
- Start/stop/reset race
- Manage teams and runners
- Log interruptions
- Change admin password

### Team Pages (`/event/:eventId`)
1. **Setup**: Configure team members and runners
2. **Planning**: Set relay order with drag & drop
3. **Live**: Track race in real-time

### Live Tracker Controls
- **Top Passage**: Record a lap without changing runner
- **Relais**: Record a lap and switch to next runner
- **Annuler**: Undo last lap recording
- **5s Minimum Gap**: Prevents accidental double-clicks

## 🎨 Design System

### Colors
- **Background**: Dark theme (`#0a0e0c`)
- **Accent**: Electric lime (`oklch(0.86 0.20 135)`)
- **Warning**: Amber (`oklch(0.82 0.17 70)`)
- **Danger**: Red (`oklch(0.72 0.21 25)`)

### Typography
- **Headings**: Space Grotesk
- **Monospace**: JetBrains Mono (for numbers, times)
- **Base Size**: 15px (desktop), 14px (mobile)

### Components
- **Cards**: Rounded corners, subtle shadows
- **Buttons**: Primary, ghost, danger variants
- **Inputs**: Dark background, focus states
- **Badges**: Pill-shaped, color-coded

## 🔐 Security

### Admin Access
- Default password: `azerty2026`
- Super admin PIN: `080687` (for password changes)
- Stored in localStorage for convenience

### Team Access
- Each team has a unique ID
- Team PIN for verification (optional)
- No authentication required for demo

## 📊 Data Model

### Organizations
```typescript
{
  id: string
  name: string
  email: string
  phone: string
  createdAt: number
}
```

### Events
```typescript
{
  id: string
  organizationId: string
  name: string
  startISO: string
  endISO: string
  status: 'upcoming' | 'active' | 'completed'
}
```

### Teams
```typescript
{
  id: string
  eventId: string
  name: string
  category: 'Hommes' | 'Mixte' | 'Femmes'
  color: string
  maxRunners: number
  goalLaps: number
  pin: string
  ready: boolean
}
```

### Runners
```typescript
{
  id: string
  teamId: string
  name: string
  kmMin: number
  kmSec: number
  color: string
  energy: 100 | 50 | 25
  status: 'ready' | 'uncertain' | 'out'
  plannedLaps: number
  liveKmMin: number | null
  liveKmSec: number | null
}
```

### Laps
```typescript
{
  id: string
  teamId: string
  runnerId: string
  timestamp: number
  lapTime: number
  type: 'top' | 'relay' | 'virtual' | 'position'
  lapNumber: number
}
```

## 🔄 Convex Integration

### Queries
- `getTeams`: List all teams for an event
- `getTeam`: Get single team with runners and laps
- `getRanking`: Get live ranking

### Mutations
- `createTeam`: Create new team
- `updateTeam`: Update team info
- `recordLap`: Record a lap
- `undoLap`: Undo last lap

### Scheduled Jobs
- `autoValidateLap`: Auto-validate laps after 900m (3-8 min)
- Uses `ctx.scheduler.runAfter` for timing

## 📱 Responsive Design

### Breakpoints
- **Desktop**: > 980px (2-column layouts)
- **Tablet**: 720px - 980px (stacked layouts)
- **Mobile**: < 720px (single column, compact)

### Mobile Optimizations
- Stacked grids
- Compact controls
- Smaller fonts
- Touch-friendly buttons
- Full-screen modals

## 🚧 Development

### Adding New Features

1. **Create Component**: Add to `src/components/`
2. **Add Route**: Create file in `src/routes/`
3. **Update CSS**: Add styles to `src/index.css`
4. **Type Safety**: Use TypeScript interfaces
5. **Test**: Verify on mobile and desktop

### Convex Development

```bash
# Start Convex dev server
npx convex dev

# Run migrations
npx convex dev --once

# View dashboard
npx convex dashboard
```

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📞 Support

For questions or issues, please open an issue on GitHub.

---

Built with ❤️ for the 24h Running community