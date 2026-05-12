# TeamLap - 24h de course à pied 2026

Application de suivi de course en temps réel avec Vite, TanStack Router, et Convex.

## Stack

- **Vite** - Build tool et dev server
- **React** - UI framework
- **TypeScript** - Type safety
- **TanStack Router** - Type-safe routing
- **Convex** - Backend/Database avec real-time sync
- **Tailwind CSS** - Styling
- **Shadcn UI** - UI components

## Installation

1. Installer les dépendances :
```bash
npm install
```

2. Configurer Convex :
```bash
npx convex dev
```
Cela va créer un projet Convex et générer le fichier `.env` avec `VITE_CONVEX_URL`.

3. Lancer l'application en développement :
```bash
npm run dev
```

## Structure du projet

```
.
├── convex/
│   ├── schema.ts          # Schéma de la base de données
│   └── functions.ts       # Queries, mutations, et scheduled jobs
├── src/
│   ├── lib/
│   │   └── utils.ts       # Utilitaires (cn, fmtClock, kmPaceToLapMs)
│   ├── routes/
│   │   ├── __root.tsx     # Route racine avec layout
│   │   ├── index.tsx      # Page d'accueil (/)
│   │   ├── event.$eventId.tsx  # Page événement (/event/:eventId)
│   │   └── admin.tsx      # Page admin (/admin)
│   ├── main.tsx           # Point d'entrée
│   └── index.css          # Styles globaux
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Convex Schema

### Organizations
Multi-tenant support pour gérer plusieurs organisations.

### Events
Événements de course avec :
- Horaires programmés (départ/arrivée)
- État de la course (scheduled/running/paused/finished)
- Configuration (distance tour, durée)
- Paramètres admin (mot de passe, PIN super-admin)

### Teams
Équipes avec :
- Informations (nom, catégorie, couleur)
- Configuration (max coureurs, objectif tours)
- État de course (currentIdx)
- Contact (référent)

### Runners
Coureurs avec :
- Pace configuré (min/km)
- Pace live (mis à jour pendant la course)
- Niveau d'énergie (affecte l'estimation)
- Planning (nombre de tours avant relay)

### Laps
Tours avec 4 types :
- `checkpoint_manual` - Checkpoint validé manuellement
- `relay_manual` - Relay validé manuellement
- `checkpoint_auto` - Checkpoint auto-validé
- `relay_auto` - Relay auto-validé

### Rankings
Classements calculés et stockés avec historique.

## Convex Functions

### Mutations
- `startRelay` - Démarre un relay avec auto-validation programmée
- `autoValidateLap` - Auto-validation des laps (scheduled job)
- `validateCheckpoint` - Validation manuelle d'un checkpoint
- `validateRelay` - Validation manuelle d'un relay

### Queries
- `getTeamsByEvent` - Récupère toutes les équipes d'un événement
- `getTeamByPin` - Récupère une équipe par son PIN
- `getLapsByTeam` - Récupère tous les tours d'une équipe
- `getRunnersByTeam` - Récupère tous les coureurs d'une équipe
- `getTeamOrder` - Récupère l'ordre des coureurs
- `getEventBySlug` - Récupère un événement par son slug
- `getEventStatus` - Récupère le statut d'un événement

## Auto-validation avec ctx.scheduler.runAfter

L'auto-validation des tours de 900m (3-8 min) est implémentée via `ctx.scheduler.runAfter` :

```typescript
export const startRelay = mutation({
  args: {
    teamId: v.id('teams'),
    runnerId: v.string(),
    expectedLapMs: v.number(),
    plannedLaps: v.number(),
  },
  handler: async (ctx, args) => {
    // Schedule auto-validation after expected lap time
    const scheduledId = await ctx.scheduler.runAfter(
      args.expectedLapMs,
      internal.functions.autoValidateLap,
      { /* args */ }
    )
    return { scheduledId }
  },
})
```

## Routes

- `/` - Page d'accueil avec liste des équipes
- `/event/:eventId` - Page de suivi d'un événement
- `/admin` - Tableau de bord administrateur

## Scripts

- `npm run dev` - Lance le serveur de développement
- `npm run build` - Build pour production
- `npm run preview` - Preview du build de production
- `npm run lint` - Lint le code

## Prochaines étapes

- [ ] Installer les dépendances (`npm install`)
- [ ] Configurer Convex (`npx convex dev`)
- [ ] Créer les composants UI (Shadcn)
- [ ] Implémenter le Dashboard avec real-time updates
- [ ] Migrer les écrans existants (Home, Admin, Team screens)
- [ ] Tester l'auto-validation
- [ ] Déployer