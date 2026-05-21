## Spec UX — #31 Slider temporel testMode (Phase 1 front-only)

### Objectif utilisateur

Permettre à un admin (Baptiste), un dev ou un démonstrateur de scrubber la
timeline de la course pour voir où étaient les markers à un instant T passé.
La carte GPX reflète la position simulée en temps réel à mesure du drag.

Phase 1 : passé uniquement (plage [startTime, Date.now()]).
Aucune mutation back-end. Aucun appel réseau supplémentaire.

---

### Personas concernés

- **Admin testMode (Baptiste)** : debug d'un incident, vérifie qu'un relais
  s'est bien déclenché au bon moment. Accès bureau ou mobile.
- **Dev** : validation visuelle du mock baked, vérification que les markers
  avancent correctement avec des données compressées.
- **Démo client** : présentation commerciale, montre le produit en rejouant
  une course fictive depuis le début. Priorité mobile (tablette en main).

---

### Contrainte de visibilité

Le composant `TimeScrubber` est **absent du DOM** (non rendu) quand
`event.testMode !== true`. Aucun toggle utilisateur : l'activation se fait
exclusivement depuis le back-office admin (champ testMode sur l'event).

---

### Position dans HomeScreen

Le slider s'insère **dans le `card-body` de la card "Circuit · live"**,
directement sous la `GpxMap`. Il n'est pas un overlay flottant.

Raison : sémantique directe (le slider contrôle la carte), pas de z-index à
gérer, pas de problème de scroll sur mobile.

```
.page
  TestModeBadge   ← bandeau rouge existant, haut de page
  .grid
    .card "Circuit · live"
      .card-head  [icone][titre][badge distance][badge LIVE elapsed]
      .card-body
        GpxMap (height=420)
        ↓ séparateur border-top 1px --border
        [TimeScrubber]  ← NOUVEAU, intra-card, sous la carte
    .card "Équipes inscrites"
```

---

### Wireframes textuels

#### Écran : HomeScreen + TimeScrubber (mode REWIND actif)

```
┌─────────────────────────────────────────────────────────────────┐
│ [topbar sticky]                                                 │
├─────────────────────────────────────────────────────────────────┤
│ ⚠  MODE TEST · Timings ÷ 3  ⚠       ← TestModeBadge existant   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 🗺️  Circuit · live          [900 m/tour]  [LIVE · 02:34]│    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │  [          GpxMap 420px — markers repositionnés       ]│    │
│  │                                                         │    │
│  ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤    │
│  │  [REWIND -47min]       14:32  [● LIVE]                  │    │
│  │                                                         │    │
│  │  ●───────────────────────────────────────────────○      │    │
│  │  |      |            |        |          |       |      │    │
│  │ 08:00   R1           R2     R3A         R5      NOW     │    │
│  │         |            |        |          |              │    │
│  │       09:14        10:31    11:45       13:02           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 👥  Équipes inscrites · 4                               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

#### Écran : TimeScrubber seul — mode LIVE

```
┌─────────────────────────────────────────────────────────┐
│                             15:19  [● LIVE]             │
│                                                         │
│  ●──────────────────────────────────────────────────●   │
│  |      |            |        |          |            ^ │
│ 08:00   R1           R2     R3A         R5          cursor
│         |            |        |          |              │
│       09:14        10:31    11:45       13:02           │
└─────────────────────────────────────────────────────────┘
```

Différences en mode LIVE :
- Badge absent (pas de REWIND, pas de T-X)
- Bouton LIVE : point pulsant vert, libellé "LIVE", non cliquable (déjà live)
- Thumb du slider positionné à l'extrémité droite, suit automatiquement

#### Écran : TimeScrubber — drag en cours

```
┌─────────────────────────────────────────────────────────┐
│ [REWIND -12min]             14:07  [  LIVE]             │
│                                                         │
│  ●────────────────────────────●──────────────────────○  │
│  |      |            |        ║  |          |           │
│ 08:00   R1           R2    [R3A] R5         R5b       NOW
│                              ↑ thumb surligné (drag actif)
└─────────────────────────────────────────────────────────┘
```

Pendant le drag :
- Track gauche (passé scrubbed) : couleur `--accent-soft`
- Thumb agrandi (20px → 24px), couleur `--accent`
- Badge REWIND visible avec décalage mis à jour en temps réel

#### Écran : TimeScrubber mobile (<720px)

```
┌──────────────────────────────────────┐
│ [REWIND -47min]   14:32  [● LIVE]    │
│                                      │
│  ●───────────────────────────────○   │
│  |    |      |    |    |         |   │
│ R0   R1     R2  R3A   R5       NOW   │
│ (labels tronqués, pas de timestamps) │
└──────────────────────────────────────┘
```

Sur mobile :
- Labels ticks : code court uniquement (R1, R2, R3A, R5, R7) — timestamps HH:mm masqués
- Thumb : 44px min touch target (padding invisible étendu)
- Bouton LIVE : 44px min height

---

### Anatomie du composant TimeScrubber

```
TimeScrubber
├── Row supérieure (flex, justify-between, align-center)
│   ├── [badge statut]  — REWIND amber / absent en LIVE
│   ├── [timestamp courant]  — "14:32" (HH:mm), mono font
│   └── [bouton LIVE]  — .live-pill pattern
│
├── Zone slider (position: relative)
│   ├── Track fond  — --surface-3, border-radius 999px, height 4px
│   ├── Track fill  — de 0 à thumbPosition%, couleur --accent-soft
│   ├── <input type="range">  — HTML5, opacity:0, position:absolute, z-index:2
│   ├── Thumb visuel  — cercle 20px, --accent, positionné via CSS var
│   └── Ticks overlay  — positionnés en % absolu sur la track
│       └── Tick
│           ├── Trait vertical  — 8px haut, 1px --muted-2
│           └── Label  — code (R1), timestamp (09:14) dessous
│
└── (aucun élément supplémentaire)
```

---

### Détail des ticks

Un tick est positionné à un timestamp `t` selon :

```
position% = (t - startTime) / (Date.now() - startTime) * 100
```

Chaque tick affiche :
- **Code** : label court fourni par les données (ex. "R1", "R2", "R3A nuit")
  - Tronqué à 6 caractères sur mobile
- **Timestamp** : HH:mm (affiché sur desktop uniquement, masqué <720px)

**Source des ticks (Phase 1)** : liste fournie en prop `ticks: Tick[]` depuis
HomeScreen. HomeScreen les calcule à partir de `allLaps` filtrés sur les types
`relay_manual` / `relay_auto`. Minimum 5 ticks requis pour affichage — en
dessous, afficher quand même avec ce qui est disponible (cf. cas limites).

**Tick actif** : le tick dont le timestamp est le plus proche du `virtualNow`
courant (dans un rayon de 2 minutes) est mis en surbrillance :
- Trait : `--accent` au lieu de `--muted-2`
- Label : `color: --text` au lieu de `--muted`

---

### Comportements d'interaction

#### Drag slider

1. L'utilisateur appuie sur le thumb (ou n'importe où sur la track).
2. Le state interne `isDragging = true` — thumb grossit à 24px.
3. À chaque mouvement, `virtualNow` est recalculé :
   ```
   virtualNow = startTime + (sliderValue / max) * (Date.now() - startTime)
   ```
4. Les markers sur la carte se repositionnent via le `now` remplacé par
   `virtualNow` dans les calculs de `progress` des markers.
5. Relâchement : `isDragging = false`, thumb revient à 20px.
6. L'intervalle `setInterval(250ms)` est suspendu pendant le drag pour éviter
   que `now` avance et déplace le thumb à la volée. Il reprend à relâchement.

**Cible de performance :** recalcul markers sur `onInput` (pas `onChange`).
60fps non garanti (contrainte SVG), mais le recalcul JS est < 1ms.

#### Snap sur tick (optionnel, activé par défaut)

Si le thumb est relâché à moins de 2 minutes d'un tick :
- `virtualNow` snaps exactement sur le timestamp du tick.
- Animation visuelle : thumb se déplace de sa position au tick (transition
  `left 80ms ease`).
- Le snap est **optionnel** : si l'utilisateur appuie immédiatement après le
  relâchement pour corriger, le snap est abandonné.

Raison du snap optionnel : utile pour la démo (jump précis sur relais), gênant
pour l'admin qui cherche une seconde précise. Faire du snap une prop
`snapToTicks?: boolean` (défaut `true`).

#### Clic sur tick (label ou trait)

- `virtualNow` = timestamp exact du tick, immédiat, sans transition.
- Badge REWIND se met à jour.
- Focus reste sur le composant (accessibilité).

#### Bouton LIVE

- Mode REWIND actif : bouton cliquable, libellé "LIVE", point muted.
  Clic → `virtualNow = null`, l'intervalle reprend, thumb saute à l'extrême
  droite de la track.
- Mode LIVE : bouton non-cliquable (disabled), libellé "LIVE", point pulsant
  vert (`--accent`, animation pulse existante `.live-pill.is-live`).

#### Navigation clavier

- Focus sur `<input type="range">` : touches Fleche Gauche / Fleche Droite.
- Fleche Gauche : `-1min` (soit `-60_000ms`)
- Fleche Droite : `+1min` (soit `+60_000ms`)
- Shift + Fleche Gauche / Droite : `+/- 10min` (soit `+/- 600_000ms`)
- Home : jump au `startTime` (début de course)
- End : jump à `Date.now()` (mode LIVE)

Le step natif de `<input type="range">` ne peut pas exprimer 1 minute en ms
directement. La navigation clavier est gérée via `onKeyDown` sur le composant
wrapper, pas via l'attribut `step` de l'input (qui lui garde `step="1"`).

---

### États visuels

#### testMode = false

Le composant `TimeScrubber` n'est pas rendu. `return null`. Aucune trace dans
le DOM. Le `now` de HomeScreen fonctionne normalement.

#### Mode LIVE (virtualNow === null ou === Date.now())

- Aucun badge affiché à gauche de la row supérieure
- Bouton LIVE : `.live-pill.is-live` — point pulsant lime, libellé "LIVE",
  `disabled`, `cursor: default`
- Track fill : longueur 100% (thumb à droite)
- Thumb suit `Date.now()` automatiquement via l'intervalle

#### Mode REWIND (virtualNow < Date.now())

- Badge gauche : `[REWIND -Xmin]`
  - Couleur : `--warn` amber, fond `--warn-soft`, border amber/0.35
  - Format du décalage :
    - < 60min : "-Xmin" (ex. "-47min")
    - >= 60min : "-Xh Ymin" (ex. "-1h 12min")
- Bouton LIVE : `.live-pill` sans `.is-live` — point muted, libellé "LIVE",
  cliquable
- Track fill : couleur `--accent-soft` de 0 à position thumb
- Thumb : couleur `--accent`

#### Drag actif (isDragging = true)

- Thumb : taille 24px (au lieu de 20px), `cursor: grabbing`
- Track fill : mise à jour temps réel
- Badge REWIND : décalage mis à jour en temps réel
- Timestamp courant : mis à jour en temps réel
- GpxMap : markers bougent en temps réel

#### Disabled (course non démarrée, raceStarted = false)

- Composant rendu mais grisé : `opacity: 0.4`, `pointer-events: none`
- Message sous le slider : "Course non démarrée — slider disponible après le
  départ"

---

### Badge "REWIND"

```
┌──────────────────┐
│  REWIND -47min   │
└──────────────────┘
```

- Classe : `.badge.warn` (pattern existant dans index.css)
- Icône : icône Lucide `RotateCcw` (16px) avant le texte
- Texte : "REWIND -Xmin" ou "REWIND -Xh Ymin"
- Masqué en mode LIVE (display: none, pas visibility:hidden)
- Pas d'animation sur le badge — mise à jour valeur uniquement

---

### Bouton LIVE

Réutilise le pattern `.live-pill` / `.live-pill.is-live` existant dans index.css.

```
Mode LIVE (disabled) :
┌────────────────┐
│ ● LIVE         │   ← point vert pulsant, texte accent
└────────────────┘

Mode REWIND (cliquable) :
┌────────────────┐
│ ○ LIVE         │   ← point gris, texte text-2
└────────────────┘
```

Attributs :
- `role="button"` ou `<button>`
- `aria-label="Revenir au temps réel"`
- `disabled` en mode LIVE
- `title="Revenir au temps réel"` en mode REWIND

---

### Timestamp courant

- Position : row supérieure, entre badge et bouton LIVE, centré
- Police : `JetBrains Mono` (classe `.mono`)
- Format : `HH:mm` (heure absolue de la course) — pas un offset, pas un
  compteur. Format `HH:mm` lisible pour la démo.
- Couleur : `--text-2` en mode LIVE, `--warn` en mode REWIND
- Taille : 13px

---

### Parcours utilisateurs

#### Parcours 1 — Admin active testMode puis scrubs

1. Admin va dans le back-office → active `testMode = true` sur l'event.
2. Admin revient sur HomeScreen (slug event).
3. **TestModeBadge** apparaît en haut (comportement existant).
4. Sous la GpxMap, le **TimeScrubber** apparaît — mode LIVE par défaut,
   thumb à droite, bouton LIVE vert pulsant.
5. Admin saisit le thumb, drag vers la gauche.
6. Badge REWIND apparaît avec le décalage mis à jour.
7. Markers sur la carte reculent en temps réel.
8. Admin relâche sur R3A — snap sur le tick R3A.
9. Admin vérifie les positions des markers au moment du relais.
10. Admin clique "LIVE" → thumb revient à droite, markers reprennent temps
    réel, badge disparaît.

#### Parcours 2 — Démonstrateur jump sur relais

1. Démo client sur mobile (tablette), event en testMode.
2. Tap sur le label "R1" (tick) → jump instantané au premier relais.
3. Carte montre les positions au moment du relais R1.
4. Tap sur "R3A" → jump au relais de nuit.
5. Tap "LIVE" → retour temps réel.

#### Parcours 3 — Navigation clavier (admin desktop)

1. Admin clique sur la zone slider, focus sur `<input type="range">`.
2. Fleche Gauche : recule de 1 minute. Badge REWIND s'affiche.
3. Shift + Fleche Gauche × 3 : recule de 30 minutes au total.
4. End : retour au temps réel, badge disparaît.

#### Parcours 4 — Admin désactive testMode

1. Admin retourne en back-office → désactive `testMode = false`.
2. HomeScreen reçoit l'event mis à jour via Convex query.
3. `event.testMode` devient false.
4. `TimeScrubber` disparaît (`return null`).
5. `virtualNow` est automatiquement ignoré — HomeScreen reprend `now` réel.
6. TestModeBadge disparaît aussi (comportement existant).

---

### Cas limites

**0 lap enregistré (course vient de démarrer)**
- Aucun tick dérivé des laps → afficher 0 ticks (track vide, pas de labels).
- Slider reste fonctionnel (scrub possible sur [startTime, now]).
- Message discret sous la track : `font-size: 11px, color: --muted`
  "Aucun relais enregistré — les ticks apparaissent au fil des relais"

**1 seul tick disponible**
- Afficher le tick unique normalement. Pas de message.
- Snap sur ce seul tick fonctionne.

**Course très courte (< 5 minutes)**
- Plage [startTime, now] très petite — slider fonctionnel, ticks si disponibles.
- Pas de comportement spécial.

**Course terminée (event.status = 'finished')**
- Plage Phase 1 : [startTime, Date.now()] — pas [startTime, finishedAt].
- Le thumb peut donc aller "après" la fin de course (dans le passé proche).
- Comportement : markers gelés sur leur dernière position connue.
- Pas de traitement spécial Phase 1 — on accepte ce comportement.
  (Phase 2 : borner à finishedAt si disponible.)

**testMode activé mais course non démarrée**
- Slider rendu mais désactivé (opacity 0.4, pointer-events none).
- Message : "Course non démarrée — slider disponible après le départ".

**Fenêtre très étroite (<360px)**
- Badge REWIND masqué (display:none) pour économiser l'espace.
- Timestamp et bouton LIVE restent visibles.
- Labels ticks : masqués, seuls les traits restent.

**Reconnexion réseau après lag**
- `allLaps` se met à jour via Convex query.
- Les ticks se recalculent automatiquement.
- Si `virtualNow` est dans le futur par rapport au nouveau `Date.now()`
  (edge case impossible en Phase 1 — passé uniquement), clamper à `Date.now()`.

---

### Accessibilité

```html
<div
  role="group"
  aria-label="Contrôle temporel — scrubber de test"
>
  <!-- Badge REWIND (aria-live pour mise à jour en direct) -->
  <div aria-live="polite" aria-atomic="true">
    REWIND -47min
  </div>

  <!-- Timestamp courant -->
  <time aria-label="Position temporelle actuelle">14:32</time>

  <!-- Input range -->
  <input
    type="range"
    min="0"
    max="{totalDurationMs}"
    value="{virtualNow - startTime}"
    step="1"
    aria-label="Scrubber temporel — position dans la course"
    aria-valuemin="0"
    aria-valuemax="{totalDurationMs}"
    aria-valuenow="{virtualNow - startTime}"
    aria-valuetext="{HHmm} — {decalageLabel}"
    onKeyDown={handleKeyDown}
  />

  <!-- Ticks : role="button" pour clic, aria-label descriptif -->
  <button
    role="button"
    aria-label="Jump au relais R3A · 11h45"
    onClick={handleTickClick}
  >
    R3A
  </button>

  <!-- Bouton LIVE -->
  <button
    aria-label="Revenir au temps réel"
    disabled={isLive}
  >
    LIVE
  </button>
</div>
```

Focus visible : ne pas supprimer l'outline natif sur l'input range.
Ajouter `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`
sur les ticks et le bouton LIVE.

---

### Structure CSS proposée (nouvelle classe)

À ajouter dans `index.css` à la suite du bloc `.unlock-slider` :

```css
/* Time scrubber — testMode only */
.time-scrubber { ... }
.time-scrubber-row { ... }      /* flex row supérieure */
.time-scrubber-track { ... }    /* zone slider + ticks */
.time-scrubber-fill { ... }     /* track gauche colorée */
.time-scrubber-thumb { ... }    /* thumb visuel custom */
.time-scrubber input[type="range"] { ... }  /* input natif invisible */
.time-scrubber-ticks { ... }    /* conteneur ticks absolus */
.time-scrubber-tick { ... }     /* tick individuel */
.time-scrubber-tick.is-active { ... }  /* tick le plus proche */
```

Pattern exact : s'inspirer de `.unlock-slider` (range HTML5 natif en
`position:absolute, opacity:0` + rendu visuel par-dessus).

---

### Notes pour @ui-designer-react

- Style sobre, utilitaire — pas d'ombres portées, pas de gradients sur le slider.
- Track fill : `--accent-soft` (14% opacity lime) — discret, lisible.
- Thumb : cercle plein `--accent`, border 2px `--bg` pour contraste sur la
  track. Taille 20px, grossit à 24px au drag.
- Labels ticks : `font-family: JetBrains Mono`, `font-size: 10px`,
  `color: --muted`, uppercase pour les codes (R1, R2...).
- Le bandeau TimeScrubber a un `border-top: 1px solid var(--border)` pour se
  séparer de la GpxMap. Padding 14px 18px (cohérent avec `.card-body`).
- Pas d'icône sur les ticks — trait vertical + label texte suffit.
- Icône Lucide `RotateCcw` (16px) dans le badge REWIND.
- Icône Lucide `Radio` ou cercle plein custom pour le point du bouton LIVE.

### Notes pour @tech-lead-front

- Point d'injection : `const [now, setNow] = useState(Date.now())` dans
  `HomeScreen.tsx` (ligne 43). Remplacer par un state unifié `virtualNow` :
  - Mode live : `virtualNow` = valeur de l'intervalle 250ms (comportement actuel)
  - Mode rewind : `virtualNow` = valeur positionnée par le slider, intervalle suspendu
- Suspendre l'intervalle pendant le drag (`clearInterval` + `setInterval` au
  relâchement) pour éviter la compétition entre le slider et le ticker.
- Les laps passés en props au TimeScrubber : filtrer `allLaps` sur les types
  `relay_manual` / `relay_auto` pour dériver les ticks.
- Aucune mutation Convex. Aucun paramètre URL. State local React uniquement.
- La plage Phase 1 est `[event.actualStart, Date.now()]`. `max` du range =
  `Date.now() - event.actualStart` en ms. Recalculer à chaque render (ou
  memoïser avec un `useMemo` sur `event.actualStart`).
- `aria-valuetext` doit être mis à jour à chaque changement de `virtualNow`.
- Composant à créer : `src/components/TimeScrubber.tsx`.
- Props suggérées :
  ```ts
  interface TimeScrubberProps {
    startTime: number          // event.actualStart (ms epoch)
    ticks: Array<{
      id: string
      label: string            // "R1", "R3A nuit"
      timestamp: number        // ms epoch
    }>
    virtualNow: number | null  // null = mode live
    onVirtualNowChange: (t: number | null) => void
    snapToTicks?: boolean      // default: true
  }
  ```
