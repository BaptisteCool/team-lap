## PLAN — #31 Slider temporel timelapse (Phase 1 front-only)

---

### 1. Périmètre

Feature de debug/démo uniquement visible quand `event.testMode === true`.
Un slider intra-card positionné sous GpxMap permet de naviguer dans la timeline
passée de la course (`[startTime, Date.now()]`).

Aucune mutation Convex. Aucun appel réseau supplémentaire. State React local.

Fichiers impactés :
- `src/hooks/useVirtualClock.ts` (stub → implémentation)
- `src/components/TestModeTimelapseSlider.tsx` (stub → implémentation)
- `src/components/HomeScreen.tsx` (intégration hook + filtrage + rendu conditionnel)
- `src/index.css` (classes `.time-scrubber-*`)

---

### 2. Architecture — Component Flow

```
HomeScreen
│
├── [l.43]  useVirtualClock(startTime, testModeDivider)
│           ↳ { virtualNow, setVirtualNow, isLive, goLive }
│
├── [l.113] elapsedMs = raceStarted ? now - raceStartTime : 0
│           ← remplacer `now` par `effectiveNow` (voir §4)
│
├── [l.136] markers = useMemo(…, [filteredLaps, effectiveNow])
│           filteredLaps = testMode
│             ? allLaps.filter(l => l.timestamp <= virtualNow)
│             : allLaps
│
├── GpxMap markers={markers}
│
└── {testMode && raceStarted && (
      <TestModeTimelapseSlider
        startTime={startTime}
        virtualNow={virtualNow}
        setVirtualNow={setVirtualNow}
        isLive={isLive}
        goLive={goLive}
        relayTicks={relayTicks}   ← dérivé des allLaps relay_manual|relay_auto
        testMode={testMode}
      />
    )}
```

**State management : local, pas de Context.**
- `useVirtualClock` est instancié dans `HomeScreen`, ses valeurs sont passées
  en props à `TestModeTimelapseSlider`.
- `TestModeTimelapseSlider` possède son propre state interne `isDragging`.
- Aucun `nuqs`, aucun `Zustand`, aucun `TanStack Query` pour cette feature.

---

### 3. Hook `useVirtualClock`

**Fichier :** `src/hooks/useVirtualClock.ts`

#### 3.1 Signature exacte (compatible tests RED)

```ts
export function useVirtualClock(
  startTime: number,
  testModeDivider?: number,   // ← paramètre 2, comme dans les tests RED
): {
  virtualNow: number
  setVirtualNow: (t: number) => void
  isLive: boolean
  goLive: () => void
}
```

Note : les tests RED appellent `useVirtualClock(START_TIME)` et
`useVirtualClock(START_TIME, divider)`. La signature à 2 paramètres est
requise pour le test Edge `testModeDivider change`.

#### 3.2 State interne

```ts
const [virtualNow, setRawVirtualNow] = useState<number>(() => Date.now())
const [isLive, setIsLive] = useState<boolean>(true)
const rafPendingRef = useRef<number | null>(null)
```

`isLive` est calculé depuis `virtualNow` : `true` si `virtualNow >= Date.now() - 1000`.
Stocker les deux séparément est plus sûr (évite les races sur `Date.now()`).

#### 3.3 setVirtualNow — throttle rAF + clamp

```ts
setVirtualNow: (t: number) => void
```

Implémentation (sketch) :

```ts
function setVirtualNow(t: number) {
  if (rafPendingRef.current !== null) return   // throttle : 1 update / frame
  rafPendingRef.current = requestAnimationFrame(() => {
    rafPendingRef.current = null
    const clamped = Math.max(startTime, Math.min(Date.now(), t))
    setRawVirtualNow(clamped)
    setIsLive(clamped >= Date.now() - 1000)
  })
}
```

Clamp : `[startTime, Date.now()]`. Jamais de valeur future (Phase 1 = passé
uniquement). Jamais avant `startTime`.

#### 3.4 goLive

```ts
function goLive() {
  if (rafPendingRef.current !== null) {
    cancelAnimationFrame(rafPendingRef.current)
    rafPendingRef.current = null
  }
  setRawVirtualNow(Date.now())
  setIsLive(true)
}
```

#### 3.5 Reset quand testModeDivider change

Effacement via `useEffect([testModeDivider])` :

```ts
useEffect(() => {
  // Quand le divider change, les timestamps mock se recalent → reset
  goLive()
}, [testModeDivider])
```

Attention : pas de `goLive` en dépendance (instable). Plutôt dupliquer les
mutations d'état dans l'effect, ou `goLive` wrappé dans `useCallback`.

#### 3.6 Extension points pour Phase 2 (#32)

Ajouter ces paramètres optionnels en préparation (non utilisés en Phase 1,
valeurs par défaut permissives) :

```ts
export function useVirtualClock(
  startTime: number,
  testModeDivider?: number,
  options?: {
    maxTime?: number            // futur : borne supérieure (finishedAt)
    onVirtualNowChange?: (t: number) => void  // futur : callback Phase 2
  }
)
```

Ces options sont ignorées silencieusement en Phase 1. Elles permettent au
hook d'être étendu en Phase 2 sans changer la signature des appelants.

---

### 4. Intégration `HomeScreen.tsx`

#### 4.1 Remplacement de `useState(Date.now())` (ligne 43)

Avant :
```ts
const [now, setNow] = useState(Date.now())
useEffect(() => {
  const id = setInterval(() => setNow(Date.now()), 250)
  return () => clearInterval(id)
}, [])
```

Après :
```ts
// now "réel" — continue à ticker à 250ms (toujours actif, pas de suspension)
const [now, setNow] = useState(Date.now())
const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

useEffect(() => {
  intervalRef.current = setInterval(() => setNow(Date.now()), 250)
  return () => clearInterval(intervalRef.current!)
}, [])

// virtualNow — clock virtuelle pour le mode testMode scrub
const testMode = (event as any)?.testMode === true
const startTime = event?.actualStart ?? Date.now()
const testModeDivider = (event as any)?.testModeDivider || 3
const { virtualNow, setVirtualNow, isLive, goLive } = useVirtualClock(startTime, testModeDivider)

// effectiveNow : virtualNow en testMode, now réel sinon
// → utilisé PARTOUT où `now` était utilisé avant
const effectiveNow = testMode ? virtualNow : now
```

**Règle :** remplacer TOUTES les occurrences de `now` dans le corps du
composant par `effectiveNow`. Les deux seules références légitimes à `now`
pur restent :
1. L'intervalle `setNow(Date.now())` (ticker)
2. Le clamp dans `useVirtualClock`

#### 4.2 Suspension de l'intervalle pendant le drag

L'intervalle 250ms reste actif pendant le scrub (burst polling non impacté).
Mais la compétition thumb ↔ ticker est évitée car `effectiveNow = virtualNow`
(le slider contrôle `virtualNow`, le ticker ne touche que `now`).

Pas de `clearInterval`/`setInterval` conditionnel : plus simple, et la spec
l'autorise ("burst polling Convex continue normalement pendant le scrub").

#### 4.3 Filtrage allLaps + mémoïsation markers

```ts
// Laps filtrés par virtualNow en testMode
const filteredLaps = useMemo(() => {
  if (!allLaps) return null
  if (!testMode) return allLaps
  return allLaps.filter((l: any) => l.timestamp <= virtualNow)
}, [allLaps, testMode, virtualNow])

// relayTicks : timestamps des relais pour les ticks du slider
const relayTicks = useMemo<number[]>(() => {
  if (!allLaps) return []
  return allLaps
    .filter((l: any) => l.type === 'relay_manual' || l.type === 'relay_auto')
    .map((l: any) => l.timestamp)
    .sort((a: number, b: number) => a - b)
}, [allLaps])
```

Le calcul `markers` existant (ligne 136) passe de `allLaps` à `filteredLaps`.
Le `lapsByTeam` map est aussi calculé depuis `filteredLaps`.
`effectiveNow` remplace `now` dans les calculs de `progress` et `elapsedMs`.

#### 4.4 Rendu conditionnel du slider — dans `.card-body` sous GpxMap

```tsx
<div className="card-body">
  <GpxMap height={420} markers={markers} showLabel lapDistanceM={…} />
  {testMode && raceStarted && (
    <TestModeTimelapseSlider
      testMode={testMode}
      startTime={startTime}
      virtualNow={virtualNow}
      setVirtualNow={setVirtualNow}
      isLive={isLive}
      goLive={goLive}
      relayTicks={relayTicks}
    />
  )}
</div>
```

Guard double : `testMode && raceStarted`. Si la course n'a pas démarré,
le slider n'est pas rendu (cas edge : course non démarrée, spec UX dit
"slider disabled", mais ici on choisit de ne pas le rendre du tout si
`!raceStarted` pour simplifier Phase 1 — acceptable car le scrub n'a rien
à montrer avant le départ).

> Alternative : rendre le slider disabled si `!raceStarted`. A trancher avec
> PO. Pour Phase 1, le guard `raceStarted` est plus simple et évite l'état
> disabled CSS supplémentaire.

---

### 5. Composant `TestModeTimelapseSlider`

**Fichier :** `src/components/TestModeTimelapseSlider.tsx`

**Décision naming :** garder `TestModeTimelapseSlider` (commits + stubs + tests
RED utilisent ce nom). La spec UX appelle ce composant `TimeScrubber` dans ses
wireframes, mais les tests d'acceptance utilisent le nom
`TestModeTimelapseSlider`. On ne renomme pas pour ne pas casser les tests.

#### 5.1 Props interface (définitive)

```ts
export interface TestModeTimelapseSliderProps {
  testMode: boolean             // guard : return null si false
  startTime: number             // event.actualStart (ms epoch)
  virtualNow: number            // timestamp courant (piloté par hook)
  setVirtualNow: (t: number) => void
  isLive: boolean
  goLive: () => void
  relayTicks?: number[]         // timestamps ms epoch des relais relay_manual|relay_auto
  snapToTicks?: boolean         // default: true
}
```

Note : la spec UX proposait `onVirtualNowChange: (t: number | null) => void`
avec `null` pour le mode live. Les tests RED utilisent `setVirtualNow` (non
nullable) et `goLive` séparés. On suit les tests RED.

#### 5.2 State interne du composant

```ts
const [isDragging, setIsDragging] = useState(false)
```

Pas de `sliderValue` en state : dérivé de `virtualNow` à chaque render.

```ts
const totalMs = Date.now() - startTime        // max du range
const sliderValue = virtualNow - startTime    // position courante
```

#### 5.3 Structure JSX (sketch)

```tsx
if (!testMode) return null

<div
  className="time-scrubber"
  role="group"
  aria-label="Contrôle temporel — scrubber de test"
>
  {/* Row supérieure */}
  <div className="time-scrubber-row">
    <div aria-live="polite" aria-atomic="true">
      {!isLive && (
        <span className="badge warn" data-testid="rewind-badge">
          <RotateCcwIcon size={16} />
          REWIND -{formatDecalage(Date.now() - virtualNow)}
        </span>
      )}
    </div>

    <time className="mono" aria-label="Position temporelle actuelle">
      {formatHHmm(virtualNow)}
    </time>

    <button
      className={`live-pill${isLive ? ' is-live' : ''}`}
      onClick={isLive ? undefined : goLive}
      disabled={isLive}
      aria-label="Revenir au temps réel"
      title={isLive ? undefined : "Revenir au temps réel"}
    >
      <span className="live-dot" />
      LIVE
    </button>
  </div>

  {/* Zone slider */}
  <div className="time-scrubber-track" style={{ '--fill-pct': `${fillPct}%` } as React.CSSProperties}>
    {/* Track fond + fill via CSS var */}

    {/* Input range natif invisible */}
    <input
      type="range"
      min={0}
      max={totalMs}
      value={sliderValue}
      step={1}
      aria-label="Scrubber temporel — position dans la course"
      aria-valuemin={0}
      aria-valuemax={totalMs}
      aria-valuenow={sliderValue}
      aria-valuetext={`${formatHHmm(virtualNow)} — ${isLive ? 'live' : formatDecalage(Date.now() - virtualNow)}`}
      onInput={handleInput}
      onMouseDown={() => setIsDragging(true)}
      onMouseUp={handleMouseUp}
      onTouchStart={() => setIsDragging(true)}
      onTouchEnd={handleMouseUp}
      onKeyDown={handleKeyDown}
      className="sr-only"  // hidden visuellement, géré par CSS .time-scrubber input[type=range]
    />

    {/* Thumb visuel */}
    <div
      className="time-scrubber-thumb"
      style={{
        left: `${fillPct}%`,
        width: isDragging ? 24 : 20,
        height: isDragging ? 24 : 20,
      }}
      aria-hidden="true"
    />

    {/* Ticks overlay */}
    <div className="time-scrubber-ticks" aria-hidden="true">
      {derivedTicks.map(tick => (
        <button
          key={tick.timestamp}
          data-testid="relay-tick"
          className={`time-scrubber-tick${isNearTick(tick) ? ' is-active' : ''}`}
          style={{ left: `${tickPct(tick.timestamp)}%` }}
          onClick={() => handleTickClick(tick.timestamp)}
          aria-label={`Jump au relais ${tick.label} · ${formatHHmm(tick.timestamp)}`}
        >
          <span className="time-scrubber-tick-line" />
          <span className="time-scrubber-tick-label">{tick.label}</span>
          <span className="time-scrubber-tick-time">{formatHHmm(tick.timestamp)}</span>
        </button>
      ))}
    </div>
  </div>
</div>
```

#### 5.4 Dérivation des ticks depuis relayTicks

```ts
// relayTicks est un tableau de timestamps bruts (number[])
// On leur assigne un label R1, R2... par ordre chronologique
const derivedTicks = useMemo(() => {
  if (!relayTicks || relayTicks.length === 0) return []
  return relayTicks
    .slice()
    .sort((a, b) => a - b)
    .map((ts, i) => ({
      timestamp: ts,
      label: `R${i + 1}`,
    }))
}, [relayTicks])
```

> Phase 1 : le label est généré (`R1`, `R2`...). Phase 2 pourrait passer un
> objet `{ label: string, timestamp: number }[]` directement si les types de
> relais ont des noms (ex. "R3A nuit"). Préparer la props en acceptant les deux
> formats via union type est prématuré — rester sur `number[]` pour Phase 1.

#### 5.5 Snap logique (optionnel, activé par défaut)

```ts
function handleMouseUp() {
  setIsDragging(false)
  if (snapToTicks !== false && derivedTicks.length > 0) {
    const TWO_MINUTES = 2 * 60 * 1000
    const closest = derivedTicks.reduce((best, tick) =>
      Math.abs(tick.timestamp - virtualNow) < Math.abs(best.timestamp - virtualNow)
        ? tick : best
    )
    if (Math.abs(closest.timestamp - virtualNow) <= TWO_MINUTES) {
      setVirtualNow(closest.timestamp)
    }
  }
}
```

#### 5.6 handleInput (drag en temps réel)

```ts
function handleInput(e: React.FormEvent<HTMLInputElement>) {
  const val = Number((e.target as HTMLInputElement).value)
  const t = startTime + val
  setVirtualNow(t)   // throttlé par rAF dans useVirtualClock
}
```

Le throttle rAF est dans le hook — le composant appelle `setVirtualNow`
librement sur chaque event `onInput`.

#### 5.7 Navigation clavier

```ts
function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  const ONE_MIN = 60_000
  const TEN_MIN = 600_000
  let delta = 0

  switch (e.key) {
    case 'ArrowLeft':  delta = e.shiftKey ? -TEN_MIN : -ONE_MIN; break
    case 'ArrowRight': delta = e.shiftKey ? +TEN_MIN : +ONE_MIN; break
    case 'Home':  setVirtualNow(startTime); return
    case 'End':   goLive(); return
    default: return
  }

  e.preventDefault()
  setVirtualNow(virtualNow + delta)
}
```

#### 5.8 Helpers de formatage (fonctions pures, dans le même fichier ou `src/lib/time-format.ts`)

```ts
function formatHHmm(ts: number): string
  // → "14:32"

function formatDecalage(ms: number): string
  // ms < 3_600_000 → "47min"
  // ms >= 3_600_000 → "1h 12min"

function tickPct(ts: number, startTime: number, totalMs: number): number
  // → (ts - startTime) / totalMs * 100

function isNearTick(tick: { timestamp: number }, virtualNow: number): boolean
  // → Math.abs(tick.timestamp - virtualNow) <= 2 * 60 * 1000
```

---

### 6. CSS — `.time-scrubber-*`

**Fichier :** `src/index.css`
**Position :** après le bloc `.unlock-slider` (fin de ligne 236)

Pattern exact inspiré de `.unlock-slider` :
- `<input type="range">` en `position: absolute; opacity: 0; z-index: 2` — interactif mais invisible
- Thumb et fill rendus par des éléments CSS au-dessus (z-index: 1)
- CSS var `--fill-pct` passée inline depuis React (comme `.unlock-slider` utilise `--slide`)

```css
/* === Time scrubber — testMode only (#31) === */
.time-scrubber {
  border-top: 1px solid var(--border);
  padding: 14px 18px;
}

.time-scrubber-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.time-scrubber-track {
  position: relative;
  height: 4px;
  background: var(--surface-3, var(--surface));
  border-radius: 999px;
  margin: 16px 0 32px;   /* 32px pour laisser de la place aux labels ticks */
}

/* Fill gauche (portion écoulée/scrubbed) */
.time-scrubber-track::before {
  content: '';
  position: absolute; left: 0; top: 0; bottom: 0;
  width: calc(var(--fill-pct, 100%) * 1);
  background: var(--accent-soft);
  border-radius: 999px;
  pointer-events: none;
}

/* Input range natif — invisible, couvre toute la zone cliquable */
.time-scrubber input[type="range"] {
  position: absolute;
  inset: -12px 0;   /* zone de tap élargie verticalement (mobile) */
  width: 100%;
  height: calc(100% + 24px);
  opacity: 0;
  cursor: grab;
  z-index: 2;
  margin: 0;
}
.time-scrubber input[type="range"]:active { cursor: grabbing; }

/* Thumb visuel — cercle positionné via left: var(--fill-pct) */
.time-scrubber-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 20px; height: 20px;
  border-radius: 999px;
  background: var(--accent);
  border: 2px solid var(--bg, #0d1210);
  pointer-events: none;
  z-index: 1;
  transition: width 80ms ease, height 80ms ease;
  /* left est injecté via style inline */
}

/* Ticks overlay — positionnés en absolu sur la track */
.time-scrubber-ticks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.time-scrubber-tick {
  position: absolute;
  top: -4px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: all;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
}
.time-scrubber-tick:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}
.time-scrubber-tick-line {
  display: block;
  width: 1px; height: 8px;
  background: var(--muted-2);
}
.time-scrubber-tick-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  margin-top: 10px;   /* espace entre track et label */
  white-space: nowrap;
}
.time-scrubber-tick-time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--muted-2);
}
.time-scrubber-tick.is-active .time-scrubber-tick-line {
  background: var(--accent);
}
.time-scrubber-tick.is-active .time-scrubber-tick-label {
  color: var(--text);
}

/* Timestamp courant */
.time-scrubber-row time {
  font-size: 13px;
  color: var(--text-2);
  font-family: 'JetBrains Mono', monospace;
}
.time-scrubber-row time.is-rewind {
  color: var(--warn);
}

/* Mobile (<720px) — labels ticks : code uniquement, timestamps masqués */
@media (max-width: 720px) {
  .time-scrubber-tick-time { display: none; }
  .time-scrubber-tick-label { font-size: 9px; }
}

/* Très petit (<360px) — badge REWIND masqué */
@media (max-width: 360px) {
  .time-scrubber-row [data-testid="rewind-badge"] { display: none; }
}
```

---

### 7. Découpage commits TDD GREEN

#### Commit 1 — `feat(#31): useVirtualClock hook`

Fichiers : `src/hooks/useVirtualClock.ts`

Rend GREEN :
- `AC10: hook exposes virtualNow/setVirtualNow/isLive/goLive`
- `AC10: virtualNow initialized to Date.now(), isLive=true on mount`
- `AC10: setVirtualNow updates virtualNow, isLive=false`
- `AC10: goLive resets to Date.now(), isLive=true`
- `Edge: clamp > Date.now()` → clamped
- `Edge: clamp < startTime` → clamped
- `Edge: testModeDivider change` → reset isLive=true

Vérification : `pnpm test:ci --reporter=verbose` → 7 tests hook GREEN.

#### Commit 2 — `feat(#31): TestModeTimelapseSlider component`

Fichiers : `src/components/TestModeTimelapseSlider.tsx`

Supprime les `vi.mock` pour `TestModeTimelapseSlider` uniquement.

Rend GREEN :
- `AC1: slider IS rendered when testMode=true`
- `AC5: >= 5 relay ticks rendered`
- `AC6: clicking tick calls setVirtualNow with snap ±2min`
- `AC7: "Live" button calls goLive`
- `AC8: REWIND badge visible when isLive=false`
- `Edge: R3A nuit tick snap + badge REWIND`

Tests déjà GREEN conservés :
- `AC1: slider NOT rendered when testMode=false` (early return)
- `AC2: slider absent du DOM` (early return)
- `AC8: badge absent when isLive=true`

#### Commit 3 — `style(#31): time-scrubber CSS`

Fichiers : `src/index.css`

Pas de changement logique — uniquement les classes `.time-scrubber-*`.
Peut être mergé avec Commit 2 si le dev préfère.

#### Commit 4 — `feat(#31): integrate slider into HomeScreen`

Fichiers : `src/components/HomeScreen.tsx`

- Supprime `vi.mock` pour `useVirtualClock`
- Supprime `vi.mock` pour `TestModeTimelapseSlider`

Rend GREEN :
- `AC1 integration: HomeScreen renders timelapse slider when testMode=true`
- `AC1 integration: HomeScreen does NOT render slider when testMode=false`

Toute la suite des 21 tests doit passer.

#### Commit 5 — `chore(#31): cleanup + verify all 21 tests GREEN`

- Vérifier que TOUS les `vi.mock` des stubs ont été supprimés du fichier test
  (ou que les mocks restants sont ceux des dépendances externes — Convex,
  GpxMap, tanstack-router — qui restent légitimes).
- `pnpm test:ci` → 21/21 GREEN.
- `pnpm tsc --noEmit` → 0 erreurs.

---

### 8. Risques techniques + mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Régression mode live si `effectiveNow` mal injecté | Critique | Guard `testMode &&` systématique. Revue ligne par ligne des occurrences de `now` dans HomeScreen après migration. |
| Cohérence dérivées : `elapsedMs`, `lapsThisStint`, `lastLap` utilisent `now` | Élevé | Remplacer toutes les occurrences de `now` par `effectiveNow`. Contrôle visuel : en mode live `effectiveNow === now`, donc pas de régression. |
| Perf 4 équipes × 50 laps sur chaque drag event | Moyen | `filteredLaps` memoïsé `[allLaps, testMode, virtualNow]`. Le filtre est O(n) pur JS sans copie — < 1ms pour 200 entrées. |
| Race condition rAF : deux setVirtualNow en vol pendant drag rapide | Faible | Guard `if (rafPendingRef.current !== null) return` dans le throttle. |
| thumb vs ticker : `now` qui avance déplace le thumb pendant scrub | Faible | Éliminé par architecture : `virtualNow` est le seul pilote du thumb, `now` ne touche pas `virtualNow`. |
| Couplage HomeScreen dense (~455 lignes actuellement) | Moyen | Ne pas extraire de custom hook supplémentaire pour Phase 1 — injection directe `useVirtualClock` est suffisante. Phase 2 pourra extraire si nécessaire. |
| `startTime` null avant chargement event | Faible | Guard : `const startTime = event?.actualStart ?? Date.now()`. Le hook reçoit toujours un number valide. |
| testMode désactivé en cours de scrub | Faible | `testMode` passe à false → `TestModeTimelapseSlider` démonté → `effectiveNow` revient à `now` réel. Markers reprennent leur calcul live. Aucun nettoyage manuel requis. |

---

### 9. API stable pour #32 Phase 2

Le hook `useVirtualClock` doit exposer le paramètre `options.maxTime` dès
Phase 1 (ignoré, mais présent) :

```ts
options?: {
  maxTime?: number            // Phase 2 : borner à finishedAt
  onVirtualNowChange?: (t: number) => void  // Phase 2 : callback pour query Convex
}
```

En Phase 2, `maxTime = event.finishedAt` bornera le slider à la fin de course.
`onVirtualNowChange` permettra de déclencher une query Convex
`getMockSnapshotAt(virtualNow)` sans modifier l'API du hook.

La signature de `TestModeTimelapseSlider` est également préparée :
le paramètre `relayTicks: number[]` peut évoluer en
`relayTicks: Array<{ timestamp: number; label: string }>` en Phase 2 sans
casser l'interface — il suffit de mettre à jour la dérivation dans HomeScreen.

---

### 10. Dépendances et checklist de livraison

- [x] Tests RED écrits (commit `5f88297`)
- [x] Stubs créés (`useVirtualClock.ts`, `TestModeTimelapseSlider.tsx`)
- [x] Spec UX livrée (`.claude/specs/31-slider-timelapse-test-mode.md`)
- [x] Plan technique TL (ce fichier)
- [ ] Implémentation → @dev-front (commits 1-5 ci-dessus)
- [ ] Review visuelle mobile + desktop → @ui-designer
- [ ] QA acceptance → @qa-front (`pnpm test:ci` 21/21 GREEN)

---

### 11. Types TypeScript à définir

```ts
// src/hooks/useVirtualClock.ts
export interface UseVirtualClockOptions {
  maxTime?: number
  onVirtualNowChange?: (t: number) => void
}

export interface UseVirtualClockReturn {
  virtualNow: number
  setVirtualNow: (t: number) => void
  isLive: boolean
  goLive: () => void
}

// src/components/TestModeTimelapseSlider.tsx
export interface TestModeTimelapseSliderProps {
  testMode: boolean
  startTime: number
  virtualNow: number
  setVirtualNow: (t: number) => void
  isLive: boolean
  goLive: () => void
  relayTicks?: number[]
  snapToTicks?: boolean
}

// Interne au composant
interface DerivedTick {
  timestamp: number
  label: string   // "R1", "R2" etc.
}
```

---

_Plan rédigé par @tech-lead-front — #31 Phase 1 front-only_
_Implémentation déléguée à @dev-front_
