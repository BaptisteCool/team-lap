## Spec UX — #32 Slider Phase 2 : scrub vers le futur (FUTURE mode)

> Delta par rapport à #31. Lire d'abord `31-slider-timelapse-test-mode.md`.

---

### Contexte

`useVirtualClock` connaît déjà `endTime = startTime + raceDurationMs`. En Phase 1, `setVirtualNow` clampe à `Date.now()` — c'est cette borne qu'on lève en Phase 2 pour permettre `virtualNow > Date.now()` jusqu'à `endTime`.

Quand `virtualNow > Date.now()` : les laps DB futurs n'existent pas encore. Le front appelle une query Convex `getMockSnapshotAt(eventId, virtualNow)` qui rejoue `buildMockChronoplaceResponse` avec `nowMs = virtualNow` et retourne les laps simulés projetés.

---

### 1. Badge FUTURE

**Couleur** : `--info` (cool blue, `oklch(0.80 0.13 220)`)
Raison : amber = REWIND (passé), lime = LIVE, rouge = danger. Le bleu = projection/hypothétique.

```
┌─────────────────────┐
│  FUTURE +12min      │   ← icône Lucide FastForward 16px
└─────────────────────┘
```

- Icône : `FastForward` (Lucide, 16px) — symétrique à `RotateCcw` pour REWIND
- Texte : `"FUTURE +Xmin"` ou `"FUTURE +Xh Ymin"`
- Position : identique au badge REWIND
- `aria-live="polite"` identique

**Timestamp courant** : couleur `--info` (au lieu de `--warn` en REWIND)

**Logique** :
```
virtualNow < Date.now()      →  badge REWIND amber
virtualNow ≈ Date.now()      →  pas de badge, LIVE
virtualNow > Date.now()      →  badge FUTURE blue
```

---

### 2. Indication visuelle "projection mock"

**a) Markers translucides** : prop `dimmed` sur `GpxMap`, `opacity: 0.65` quand `isFuture=true`.

**b) Label "SIMULATION" sous track** :

```
[Simulation] Projection mock · positions estimées
```

- `font-size: 11px; color: var(--info)`
- Icône `FlaskConical` (Lucide, 12px)
- Masqué quand `!isFuture`

---

### 3. Loading state

Query = pure computation (< 100ms attendu).

- Pendant fetch : spinner inline `<Loader2 size={14} className="spin" />` remplace l'icône `FastForward` dans le badge
- Markers gardent leur dernière position connue (pas de flash vide)
- Debounce 150ms sur l'indicateur spinner (n'affiche pas si fetch < 150ms)

---

### 4. Erreur fetch

- Toast inline sous slider : `[AlertCircle 12px] Projection indisponible — positions affichées sont les dernières connues`
- Style : `font-size: 11px; color: var(--warn)`
- Markers restent sur dernière position projetée valide
- Pas de retry auto

---

### 5. Transitions entre LIVE / REWIND / FUTURE

| De | Vers | Comportement |
|----|------|--------------|
| LIVE | REWIND | Badge REWIND amber, timestamp amber, filteredLaps front |
| LIVE | FUTURE | Badge FUTURE bleu, markers translucides, label simulation visible |
| REWIND | FUTURE | Swap badge amber → bleu en traversant LIVE |
| FUTURE | LIVE | Bouton LIVE ou drag back → markers opaques, badge disparaît |
| FUTURE | REWIND | Drag gauche de Date.now() → swap bleu → amber, markers opaques |

Transitions instantanées, pas d'animation cross-fade.

---

### Modification clamp `useVirtualClock`

```
// Phase 1 : maxBound = Math.min(endTime ?? now, now)
// Phase 2 : maxBound = endTime ?? now   ← retirer le min avec now
```

Nouveau dérivé : `isFuture = !isLive && virtualNow > Date.now()`

---

### Nouveaux props `TestModeTimelapseSlider`

```ts
interface TestModeTimelapseSliderProps {
  isFuture?: boolean
  isFutureLoading?: boolean
  futureError?: boolean
}
```

---

### Cas limites

- **virtualNow > endTime** : clampé à `endTime` par hook. Thumb bloqué à droite.
- **Course non démarrée** : slider désactivé, `isFuture` jamais vrai.
- **testMode off** : slider `return null`, query jamais appelée.
- **Drag rapide traversant Date.now()** : badge swap amber↔bleu en temps réel.

---

### Notes UI / Tech

- Ajouter `.badge.info` : `background: oklch(0.80 0.13 220 / 0.14); color: var(--info); border-color: oklch(0.80 0.13 220 / 0.35);`
- Icônes : `FastForward`, `Loader2.spin`, `FlaskConical`
- `dimmed` prop sur GpxMap → `opacity` group SVG
- `getMockSnapshotAt` : query Convex pure (pas DB), réutilise `buildMockChronoplaceResponse`
- `useQuery(api.chronoplace.getMockSnapshotAt, isFuture ? { eventId, virtualNow } : 'skip')`
