## PLAN — #32 Slider timelapse Phase 2 — branchement front scrub futur

---

### 1. Périmètre

Extension de la Phase 1 (#31). Le slider est déjà livré et borné `[startTime, endTime]`
(Phase 1 a étendu la borne à `endTime` via `useVirtualClock options.endTime`).

Phase 2 branche la query Convex `chronoplace.getMockSnapshotAt` quand
`virtualNow > Date.now() + 1000`. En dessous de ce seuil, le comportement
Phase 1 reste intact (filtre front sur `allLaps`).

Fichiers impactés :
- `src/hooks/useFutureSnapshot.ts` — **nouveau** — hook dédié scrub futur
- `src/components/HomeScreen.tsx` — branchement hook + bascule laps source
- `src/components/TestModeTimelapseSlider.tsx` — badge FUTURE + loading + erreur

**Strictement read-only.** Aucune mutation Convex. Aucun impact sur burst polling.

---

### 2. Architecture — Component Flow

```
HomeScreen
│
├── useVirtualClock(startTime, testModeDivider, { endTime })
│   ↳ { virtualNow, setVirtualNow, isLive, goLive }
│
├── useFutureSnapshot(event._id, virtualNow, testMode)   ← NOUVEAU
│   ↳ { laps: FutureLap[] | null, isLoading: boolean, error: Error | null }
│
├── filteredLaps = useMemo(() => {
│     if (!testMode) return allLaps                   // live normal
│     if (virtualNow > Date.now() + 1000) {
│       return futureLaps ?? lastValidSnapshotRef     // FUTURE
│     }
│     return allLaps?.filter(l => l.timestamp <= virtualNow) // PAST (Phase 1)
│   }, [allLaps, testMode, virtualNow, futureLaps])
│
├── lapsByTeam = useMemo(…, [filteredLaps])   (inchangé)
│
├── markers = useMemo(…, [lapsByTeam, effectiveNow])  (inchangé)
│
├── GpxMap markers={markers}
│
└── {testMode && raceStarted && (
      <TestModeTimelapseSlider
        …propsExistantes
        isFuture={virtualNow > Date.now() + 1000}
        futureOffsetMs={virtualNow - Date.now()}
        isLoadingFuture={isLoadingFuture}
      />
    )}
```

**Pas de Context, pas de Zustand.** State de la query dans `useFutureSnapshot`
via `useQuery` Convex + debounce local. Le hook est instancié dans `HomeScreen`
et ses retours descendus en props.

---

### 3. Hook `useFutureSnapshot`

**Fichier :** `src/hooks/useFutureSnapshot.ts`

#### 3.1 Signature

```ts
import type { Id } from '../../convex/_generated/dataModel'

export type FutureLap = {
  teamId: string
  runnerId: string | null
  timestamp: number
  lapTime: number
  lapNumber: number
  type: string
  prevCurrentIdx?: number
}

export type UseFutureSnapshotReturn = {
  laps: FutureLap[] | null
  isLoading: boolean
  error: Error | null
}

export function useFutureSnapshot(
  eventId: Id<'events'> | undefined,
  virtualNow: number,
  testMode: boolean,
): UseFutureSnapshotReturn
```

#### 3.2 Logique interne — debounce + skip guard

```ts
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { useQuery } from '../convex/hooks'

const FUTURE_THRESHOLD_MS = 1000

export function useFutureSnapshot(
  eventId: Id<'events'> | undefined,
  virtualNow: number,
  testMode: boolean,
): UseFutureSnapshotReturn {
  const isFuture = testMode && virtualNow > Date.now() + FUTURE_THRESHOLD_MS

  // useDeferredValue = debounce React natif, lag ~100ms sur les renders non-urgents.
  // Convex useQuery est reactive — le deferral fait que les appels pendant drag
  // n'envoient pas de requête à chaque ms.
  const deferredVirtualNow = useDeferredValue(virtualNow)

  const result = useQuery(
    'chronoplace:getMockSnapshotAt' as any,
    isFuture && eventId
      ? { eventId, virtualNow: deferredVirtualNow }
      : 'skip',
  ) as FutureLap[] | null | undefined

  // Cache du dernier snapshot valide — évite flash/blanc pendant transition
  const lastValidRef = useRef<FutureLap[] | null>(null)
  if (result !== undefined && result !== null) {
    lastValidRef.current = result
  }

  const [error, setError] = useState<Error | null>(null)

  // Reset error quand on sort du mode futur
  useEffect(() => {
    if (!isFuture) setError(null)
  }, [isFuture])

  // Convex useQuery throw => capturé par error boundary du parent ou via try/catch
  // Pour le toast : le composant TestModeTimelapseSlider réagit à `error !== null`

  const isLoading = isFuture && result === undefined

  return {
    laps: isFuture
      ? (result ?? lastValidRef.current)   // fallback au dernier snapshot
      : null,
    isLoading,
    error,
  }
}
```

**Pourquoi `useDeferredValue` et pas `useDebounce` custom ?**
- Natif React 18+ — pas de dépendance
- Convex `useQuery` est reactive : la query n'est re-souscrite que quand
  `deferredVirtualNow` change (React diffère les renders non-urgents ~frame)
- Pendant le drag rapide, le rendu prioritaire se passe, la query Convex
  reçoit la valeur différée → pas de spam réseau observable

**Note sur l'erreur :** Convex `useQuery` throw dans le render si la query
throw côté serveur (ex. `testMode=false`). Il faut wrapper l'appel dans un
ErrorBoundary ou intercepter via un pattern try/useEffect. La solution
pragmatique est d'utiliser un ErrorBoundary léger autour du composant
`TestModeTimelapseSlider`, pas autour du hook entier, pour ne pas affecter
`HomeScreen`. Voir §7.1.

---

### 4. Intégration `HomeScreen.tsx`

#### 4.1 Ajout du hook

```ts
// Après useVirtualClock (l.120 environ)
const {
  laps: futureLaps,
  isLoading: isLoadingFuture,
  error: futureError,
} = useFutureSnapshot(event?._id, virtualNow, testMode)
```

#### 4.2 Bascule `filteredLaps`

Remplacer le `useMemo` Phase 1 :

```ts
// Phase 1 :
// const filteredLaps = useMemo(() => {
//   if (!allLaps) return null
//   if (!testMode) return allLaps
//   return allLaps.filter((l: any) => l.timestamp <= virtualNow)
// }, [allLaps, testMode, virtualNow])

// Phase 2 :
const filteredLaps = useMemo(() => {
  if (!testMode) return allLaps ?? null
  if (virtualNow > Date.now() + 1000) {
    // Mode FUTURE : utiliser snapshot Convex si disponible
    return futureLaps ?? (allLaps?.filter((l: any) => l.timestamp <= Date.now()) ?? null)
  }
  // Mode PAST (Phase 1 intact)
  if (!allLaps) return null
  return allLaps.filter((l: any) => l.timestamp <= virtualNow)
}, [allLaps, testMode, virtualNow, futureLaps])
```

**Fallback futur vide :** si `futureLaps === null` (query en loading ou echec),
on fallback sur les laps jusqu'à `Date.now()` — jamais de `null` pure qui
ferait disparaître tous les markers.

#### 4.3 Props supplémentaires pour le slider

```tsx
<TestModeTimelapseSlider
  testMode={testMode}
  startTime={startTime}
  endTime={endTime}
  virtualNow={virtualNow}
  setVirtualNow={setVirtualNow}
  isLive={isLive}
  goLive={goLive}
  relayTicks={relayTicks}
  snapToTicks={true}
  // NOUVEAU Phase 2 :
  isFuture={virtualNow > Date.now() + 1000}
  futureOffsetMs={Math.max(0, virtualNow - Date.now())}
  isLoadingFuture={isLoadingFuture}
  futureError={futureError}
/>
```

#### 4.4 Toast sur erreur future

```ts
// useEffect dans HomeScreen, dépendance futureError
useEffect(() => {
  if (futureError) {
    // Toast system existant — adapter à l'API réelle du projet
    // (ex: shadcn toast, sonner, ou console.warn si pas de toast)
    console.warn('[FutureSnapshot] query failed:', futureError.message)
    // TODO : remplacer par le système de toast réel quand identifié
  }
}, [futureError])
```

> Note pour @dev-front : identifier le système de toast du projet
> (`src/components/ui/` ou `sonner`) avant d'implémenter cette ligne.
> Si absent, laisser `console.warn` en Phase 2 et créer une issue toast.

---

### 5. Modifications `TestModeTimelapseSlider`

#### 5.1 Nouvelles props

```ts
export type TestModeTimelapseSliderProps = {
  // …props existantes Phase 1…
  testMode: boolean
  startTime: number
  endTime?: number
  virtualNow: number
  setVirtualNow: (t: number) => void
  isLive: boolean
  goLive: () => void
  relayTicks?: RelayTickInput[]
  snapToTicks?: boolean
  // NOUVEAU Phase 2 :
  isFuture?: boolean             // virtualNow > Date.now() + 1000
  futureOffsetMs?: number        // Math.max(0, virtualNow - Date.now())
  isLoadingFuture?: boolean      // query en cours
  futureError?: Error | null     // erreur query
}
```

#### 5.2 Badge FUTURE

Dans la row supérieure du slider, à côté (ou à la place) du badge REWIND :

```tsx
<div aria-live="polite" aria-atomic="true">
  {isFuture ? (
    <span className="badge future" data-testid="future-badge">
      {isLoadingFuture && <LoaderCircle size={14} className="animate-spin" />}
      FUTURE +{formatDecalage(futureOffsetMs ?? 0)}
    </span>
  ) : !isLive ? (
    <span className="badge warn" data-testid="rewind-badge">
      <RotateCcw size={16} />
      REWIND -{decalageLabel}
    </span>
  ) : null}
</div>
```

**Règle :** FUTURE prime sur REWIND (mutually exclusive car `isFuture` implique
`virtualNow > Date.now()` donc `!isLive`). Un seul badge affiché.

#### 5.3 Marker LIVE visible dans la fenêtre futur

Quand `virtualNow > Date.now()`, le marker LIVE est toujours présent sur la
track (c'est le présent réel qui se déplace dans la fenêtre passée). Le code
existant le gère déjà via `liveInWindow = nowMs >= windowStart && nowMs <= windowEnd`.
Pas de changement nécessaire.

#### 5.4 CSS — badge `.future`

Ajouter dans `src/index.css` (après `.badge.warn`) :

```css
.badge.future {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  color: var(--info, #60a5fa);       /* bleu info */
  background: color-mix(in srgb, var(--info, #60a5fa) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--info, #60a5fa) 25%, transparent);
  border-radius: 6px;
  padding: 2px 8px;
}
```

#### 5.5 Aria-valuetext futur

Mettre à jour `aria-valuetext` de l'input range :

```tsx
aria-valuetext={
  isFuture
    ? `${formatHHmm(virtualNow)} — FUTUR +${formatDecalage(futureOffsetMs ?? 0)}`
    : isLive
      ? `${formatHHmm(virtualNow)} — live`
      : `${formatHHmm(virtualNow)} — ${decalageLabel}`
}
```

---

### 6. Type Safety — Shape FutureLap vs Lap Convex

La query `getMockSnapshotAt` retourne des objets qui alimentent `filteredLaps`,
lui-même consommé par `lapsByTeam` → `markers`. Le shape doit être compatible.

Shape actuel d'un lap Convex utilisé dans `markers` (extrait HomeScreen l.188) :
```ts
{
  type: string          // 'relay_manual' | 'relay_auto' | 'lap' | 'position'
  timestamp: number
  teamId: string
  lapTime: number
  lapNumber: number
  runnerId?: string
  prevCurrentIdx?: number
}
```

Shape `FutureLap` retourné par la query (à valider avec @tech-lead-back) :
```ts
export type FutureLap = {
  teamId: string
  runnerId: string | null
  timestamp: number
  lapTime: number
  lapNumber: number
  type: string                  // 'lap' | 'relay_manual' | 'relay_auto'
  prevCurrentIdx?: number
}
```

Les deux shapes sont structurellement compatibles pour les accès dans `markers`.
`runnerId: null` vs `undefined` : le code existant utilise `l.runnerId` dans
certains endroits — vérifier que `null` est géré (utiliser `??` pas `||`).

**Contrat avec @tech-lead-back :** la query DOIT retourner ce shape exact.
Ajouter un validator Zod côté client si la query peut évoluer.

---

### 7. Gestion d'erreur robuste

#### 7.1 ErrorBoundary autour du slider

Convex `useQuery` peut throw dans le render quand la query throw serveur
(ex: testMode guard). Pour isoler cet échec sans crasher HomeScreen :

```tsx
// src/components/HomeScreen.tsx (rendu conditionnel slider)
{testMode && raceStarted && (
  <SliderErrorBoundary onError={handleFutureError}>
    <TestModeTimelapseSlider … />
  </SliderErrorBoundary>
)}
```

`SliderErrorBoundary` : ErrorBoundary classe minimaliste dans
`src/components/SliderErrorBoundary.tsx` — affiche `null` sur erreur et
appelle `onError(err)` pour déclencher le toast.

#### 7.2 Fallback au dernier snapshot valide

Dans `useFutureSnapshot`, le `lastValidRef` maintient le dernier snapshot
non-null reçu. Si la query repart en `undefined` (loading suite à changement
de `virtualNow`), on retourne `lastValidRef.current` — les markers ne
disparaissent pas pendant le drag.

#### 7.3 Edge case : `endTime` non défini

`useVirtualClock` reçoit `endTime = startTime + raceDurationMs` (HomeScreen l.119).
Si `raceDurationMs` n'est pas défini sur l'event, `raceDurationMs` fallback sur
`24 * 3600 * 1000` (déjà en place l.118). Le scrub futur est donc toujours borné.

---

### 8. Découpage commits TDD GREEN

**Prérequis :** la query Convex `chronoplace:getMockSnapshotAt` est disponible
et retourne le shape `FutureLap[]` (dépendance @tech-lead-back).

#### Commit 1 — `feat(#32): useFutureSnapshot hook + HomeScreen branchement`

Fichiers :
- `src/hooks/useFutureSnapshot.ts` (créer)
- `src/components/HomeScreen.tsx` (modifier)

Critères GREEN :
- `virtualNow <= Date.now()` → `futureLaps === null`, behavior Phase 1 intact
- `virtualNow > Date.now() + 1000` → query souscrite avec `deferredVirtualNow`
- `testMode=false` → query en `'skip'` systématique
- `filteredLaps` bascule correctement entre past/future

Tests unitaires à écrire (`src/hooks/useFutureSnapshot.test.ts`) :
```
- [skip] quand testMode=false
- [skip] quand virtualNow <= Date.now() + 1000
- [souscrit] quand testMode=true et virtualNow > Date.now() + 1000
- [fallback] retourne lastValid si result === undefined (loading)
- [null laps] retourne null si !isFuture
```

#### Commit 2 — `feat(#32): badge FUTURE + loading/error dans slider`

Fichiers :
- `src/components/TestModeTimelapseSlider.tsx` (modifier)
- `src/components/SliderErrorBoundary.tsx` (créer)
- `src/index.css` (badge .future)

Critères GREEN :
- `isFuture=true` → `data-testid="future-badge"` visible
- `isFuture=false` → badge FUTURE absent
- `isLoadingFuture=true` → spinner `LoaderCircle` dans le badge
- `isFuture=true, !isLive` → badge FUTURE affiché (pas badge REWIND)
- aria-valuetext mis à jour

#### Commit 3 — `chore(#32): cleanup + verify all tests GREEN`

- `pnpm test:ci` → tout GREEN
- `pnpm tsc --noEmit` → 0 erreurs
- Valider edge case testMode=false pendant scrub futur :
  event.testMode toggle → `TestModeTimelapseSlider` démonté → query skip

---

### 9. Risques techniques

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Flash markers pendant transition past → future | Moyen | `lastValidRef` dans `useFutureSnapshot` — retour au dernier snapshot valide |
| Query Convex throw au render (testMode guard serveur) | Elevé | `SliderErrorBoundary` isole le crash + fallback `null` |
| Cohérence bascule `virtualNow == Date.now()` (±1s) | Moyen | Seuil `Date.now() + 1000` fixe — pas de seuil flottant. La bascule ne se fait qu'en passant ce cap |
| Rerender flicker `useTransition` nécessaire ? | Faible | `useDeferredValue` sur `virtualNow` suffit. `useTransition` serait utile si le rendu markers coûtait > 50ms — les `useMemo` existants le préviennent |
| FutureLap shape incompatible avec markers existants | Elevé | Vérification contractuelle avec @tech-lead-back. Ajouter validation Zod à la réception si instable |
| `relayTicks` Phase 1 basés sur `allLaps` (laps réels) | Moyen | Les ticks du slider restent basés sur `allLaps` (tous les relais réels + futurs déjà en DB). Les ticks futurs hors DB ne s'affichent pas — acceptable en Phase 2, peut évoluer Phase 3 |
| Multi-onglets | Négligeable | Convex gère le cache par souscription — chaque onglet a sa propre query |

---

### 10. Dépendances

- [ ] **@tech-lead-back** : query `chronoplace:getMockSnapshotAt(eventId, virtualNow)`
  disponible, retourne `FutureLap[]` avec shape documenté §6
- [ ] **@tech-lead-back** : confirmer que la query ne déclenche aucune mutation
  et que le guard `testMode=false → ConvexError` est en place
- [ ] **@dev-front** : identifier le système de toast du projet avant Commit 1
  (adapter `useEffect` sur `futureError` en conséquence)
- [ ] **@qa-front** : vérifier via Network panel que le debounce 100ms fonctionne
  (Convex WS — les messages de souscription ne doivent pas spammer à chaque ms)

---

### 11. Fichiers impactés (résumé)

| Fichier | Changement |
|---------|------------|
| `src/hooks/useFutureSnapshot.ts` | Créer — hook dédié scrub futur |
| `src/components/HomeScreen.tsx` | Modifier — branchement hook + bascule filteredLaps |
| `src/components/TestModeTimelapseSlider.tsx` | Modifier — badge FUTURE + props isFuture/isLoading/error |
| `src/components/SliderErrorBoundary.tsx` | Créer — ErrorBoundary isolé pour le slider |
| `src/index.css` | Modifier — `.badge.future` CSS |

---

_Plan rédigé par @tech-lead-front — #32 Phase 2 front scrub futur_
_Implémentation déléguée à @dev-front_
_Dépendance back : @tech-lead-back (query getMockSnapshotAt)_
