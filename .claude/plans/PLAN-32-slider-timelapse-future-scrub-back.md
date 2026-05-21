## PLAN — Issue #32 Slider timelapse Phase 2 scrub futur (Backend Convex)

### Perimetre

Ajout d'une query Convex publique `chronoplace.getMockSnapshotAt` et d'un helper pur
`computeSnapshotAt` dans `convex/lib/mockChronoplaceSchedule.ts`. La query calcule
l'etat complet des laps pour toutes les equipes mock a un instant `virtualNow` arbitraire
(passe ou futur), sans jamais ecrire en base. Strictement gated derriere `testMode=true`.

Scope back-only. Le front (#32 phase front) branche la query quand `virtualNow > Date.now()`.

---

### Architecture — deux objets a creer

```
convex/lib/mockChronoplaceSchedule.ts   <-- helper pur computeSnapshotAt (existant + ajout)
convex/chronoplace.ts                   <-- query publique getMockSnapshotAt (ajout)
```

Aucune table nouvelle. Aucune migration Prisma (projet Convex, pas Prisma).
Aucune ecriture DB.

---

### Type retour du snapshot

Le front consomme les laps via `filteredLaps` — meme forme que les laps DB du schema `laps`.
On retourne un array de laps virtuels avec les champs minimaux compatibles :

```typescript
type VirtualLap = {
  teamId: string           // Id<'teams'> serialise en string (pas de ctx dans helper pur)
  runnerId: string
  lapNumber: number
  timestamp: number        // ms epoch = revealAtMs compresse
  lapTime: number          // ms compresse (= realSec * 1000 / divider)
  type: 'checkpoint_auto' | 'relay_auto'
  prevCurrentIdx?: number  // snapshot currentIdx avant ce lap (pour undo compat)
  source: 'mock_snapshot'  // distingue les laps virtuels des laps DB reels
}
```

Champ `source: 'mock_snapshot'` permet au front de distinguer snapshot virtuel vs lap DB.
Pas de `_id`, `_creationTime` (champs systeme Convex absents hors DB).

---

### Helper `computeSnapshotAt`

Fichier : `convex/lib/mockChronoplaceSchedule.ts` (ajout en bas du fichier existant)

Signature :

```typescript
type SnapshotLap = {
  teamSlug: string
  lapNumber: number
  timestamp: number        // revealAtMs
  lapTime: number          // ms compresse
  type: 'checkpoint_auto' | 'relay_auto'
  runnerId: string         // runner name (pas d'Id Convex — helper pur sans ctx)
  prevCurrentIdx: number
}

export function computeSnapshotAt(
  event: {
    actualStart: number
    testModeDivider?: number
  },
  virtualNow: number,
  slugs: string[],          // liste des slugs equipes a calculer
): SnapshotLap[]
```

Logique interne :

1. Pour chaque slug dans `slugs`, appelle `getMockLapMeta(slug, lapN, actualStart, divider)`
   en iteration sur lapN = 1..N jusqu'a `revealAtMs > virtualNow` (break early).
2. Pour chaque lap eligible (`revealAtMs <= virtualNow`) :
   - `type` = `isMockRelayLap(lapN)` ? `'relay_auto'` : `'checkpoint_auto'`
   - `runnerId` = `getMockRunnerForLap(lapN) ?? ''` (Heroes uniquement ; autres equipes → `''`)
   - `prevCurrentIdx` = compteur local reset a chaque relay dans l'iteration
3. Retourne array plat de tous les laps, toutes equipes confondues, tries par `timestamp` asc.

Pas d'import `ctx`. Pas d'acces DB. Pur calcul depuis les tableaux baked.

Reutilisation totale des helpers existants :
- `getMockLapMeta` (boucle cumulative sur `config.laps`)
- `isMockRelayLap` (detecte relay depuis SCHEDULE)
- `getMockRunnerForLap` (runner name Heroes depuis SCHEDULE)

Aucune duplication de logique.

---

### Query publique `getMockSnapshotAt`

Fichier : `convex/chronoplace.ts` (ajout en section Public queries, apres les exports existants)

Import additionnel en haut du fichier :
```typescript
import { query } from './_generated/server'
import { ConvexError } from 'convex/values'
import { computeSnapshotAt } from './lib/mockChronoplaceSchedule'
```

Implementation :

```typescript
export const getMockSnapshotAt = query({
  args: {
    eventId: v.id('events'),
    virtualNow: v.number(),
  },
  handler: async (ctx, { eventId, virtualNow }) => {
    const event = await ctx.db.get(eventId)
    if (!event?.testMode) {
      throw new ConvexError('getMockSnapshotAt requires testMode=true')
    }

    const actualStart = event.actualStart
    if (!actualStart || virtualNow < actualStart) {
      return []
    }

    // Recupere tous les slugs mock actifs pour cet event
    const teams = await ctx.db
      .query('teams')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect()

    const mockSlugs = teams
      .map((t) => (t as any).chronoplaceSlug as string | undefined)
      .filter((s): s is string => typeof s === 'string' && shouldUseMockChronoplace(s, true))

    const snapshotLaps = computeSnapshotAt(
      { actualStart, testModeDivider: event.testModeDivider },
      virtualNow,
      mockSlugs,
    )

    // Enrichit chaque lap avec le teamId Convex correspondant
    const slugToTeamId = new Map(
      teams
        .filter((t) => (t as any).chronoplaceSlug)
        .map((t) => [(t as any).chronoplaceSlug as string, t._id]),
    )

    return snapshotLaps.map((lap) => ({
      ...lap,
      teamId: slugToTeamId.get(lap.teamSlug) ?? '',
      source: 'mock_snapshot' as const,
    }))
  },
})
```

Note : `shouldUseMockChronoplace` est deja importe dans `chronoplace.ts`.

---

### Edge cases couverts

| Cas | Comportement |
|-----|-------------|
| `virtualNow < actualStart` | Retourne `[]` immediat (guard avant computeSnapshotAt) |
| `testMode=false` | `throw new ConvexError('getMockSnapshotAt requires testMode=true')` |
| `testMode=undefined` | Meme throw (guard `!event?.testMode`) |
| `event` inexistant | `ctx.db.get` retourne `null` → guard throw |
| Equipe sans slug mock (ex: equipe manuelle) | Filtree par `shouldUseMockChronoplace` → ignoree |
| `virtualNow == Date.now()` | Meme resultat que `buildMockChronoplaceResponse` filtre a `nowMs` |
| `virtualNow` futur > fin course | `getMockLapMeta` retourne null apres le dernier lap → break natural |
| Schedule incoherent (null runner) | `runnerId = ''` — warning log recommande dans computeSnapshotAt |
| `testModeDivider` absent | Fallback `divider = 3` (meme convention que getMockLapMeta) |

---

### Perf

- Aucun acces DB dans `computeSnapshotAt` — pure JS sur arrays baked en memoire.
- La query lit 1 event + N teams (N <= 10 en pratique). Deux lectures indexees.
- Iteration laps : worst case 349 laps (Licornes) × 4 equipes = ~1400 iterations JS.
  Toutes en memoire, pas de I/O. Objectif < 20ms server-side realiste, < 100ms garanti.
- Pas de cache additionnel necessaire.

---

### Tests unitaires — Commit 1 GREEN (helper pur)

Fichier : `convex/lib/mockChronoplaceSchedule.test.ts`

Cas a couvrir :

```
computeSnapshotAt — virtualNow < actualStart → []
computeSnapshotAt — virtualNow == actualStart → []
computeSnapshotAt — virtualNow = actualStart + (lapTime lap 1 + 1ms) → 1 lap lap1 Heroes
computeSnapshotAt — relay lap detecte correctement (type = relay_auto)
computeSnapshotAt — non-relay lap (type = checkpoint_auto)
computeSnapshotAt — runnerId correct via getMockRunnerForLap
computeSnapshotAt — equipe sans schedule Heroes (Licornes) → runnerId = ''
computeSnapshotAt — virtualNow tres grand (> toute course) → tous les laps
computeSnapshotAt — prevCurrentIdx incremente apres chaque relay
computeSnapshotAt — plusieurs equipes → laps mixes tries par timestamp asc
```

Framework : `vitest` + `convex-test` (pattern existant dans le projet).

---

### Tests integration — Commit 2 GREEN (query gated)

Fichier : `convex/chronoplace.test.ts` (ajout section `getMockSnapshotAt`)

Cas a couvrir :

```
getMockSnapshotAt — event testMode=false → throw ConvexError
getMockSnapshotAt — event inexistant → throw ConvexError
getMockSnapshotAt — virtualNow < actualStart → []
getMockSnapshotAt — event testMode=true, equipe Heroes → laps avec teamId enrichi
getMockSnapshotAt — equipe sans slug mock dans event testMode → ignoree
getMockSnapshotAt — source = 'mock_snapshot' sur chaque lap retourne
```

---

### Decoupage commits TDD GREEN

**Commit 1** — Helper pur `computeSnapshotAt`
- Ajout type `SnapshotLap` dans `mockChronoplaceSchedule.ts`
- Implementation `computeSnapshotAt`
- Tests unitaires `mockChronoplaceSchedule.test.ts` GREEN

**Commit 2** — Query publique `getMockSnapshotAt`
- Ajout import `query`, `ConvexError`, `computeSnapshotAt` dans `chronoplace.ts`
- Implementation query `getMockSnapshotAt`
- Tests integration `chronoplace.test.ts` section GREEN

**Commit 3** — Cleanup + verification
- Verifier qu'aucune mutation n'est appelee dans les deux nouveaux exports
- Verifier que `getMockSnapshotAt` n'apparait pas dans les imports `internal` (doit etre `api`)
- Confirmer GREEN complet sur la suite de tests existante

---

### Fichiers impactes

| Fichier | Changement |
|---------|-----------|
| `convex/lib/mockChronoplaceSchedule.ts` | Ajout type `SnapshotLap` + fonction `computeSnapshotAt` |
| `convex/chronoplace.ts` | Ajout import `query`/`ConvexError`/`computeSnapshotAt` + query `getMockSnapshotAt` |
| `convex/lib/mockChronoplaceSchedule.test.ts` | Nouveau fichier tests unitaires helper |
| `convex/chronoplace.test.ts` | Ajout section tests integration query |

Aucun autre fichier touche. Zero migration DB. Zero mutation.

---

### Dependances

- Bloquee par #31 (Phase 1 doit etre livree) — la query est autonome mais le front ne peut
  pas l'appeler sans le slider Phase 1.
- Front (#32 phase front) a besoin de la signature exacte du retour : array de `SnapshotLap`
  enrichis avec `teamId: Id<'teams'>` et `source: 'mock_snapshot'`.

### Taches ordonnees pour @dev-back

1. [ ] Ajouter type `SnapshotLap` + exporter `computeSnapshotAt` dans `convex/lib/mockChronoplaceSchedule.ts`
2. [ ] Ecrire tests unitaires `convex/lib/mockChronoplaceSchedule.test.ts` — GREEN
3. [ ] Ajouter import `query`, `ConvexError`, `computeSnapshotAt` dans `convex/chronoplace.ts`
4. [ ] Implémenter query `getMockSnapshotAt` dans `convex/chronoplace.ts`
5. [ ] Ecrire tests integration section `getMockSnapshotAt` dans `convex/chronoplace.test.ts` — GREEN
6. [ ] Verifier que `npx convex dev --once` passe sans erreur de type
7. [ ] Verifier que toute la suite de tests existante reste GREEN
