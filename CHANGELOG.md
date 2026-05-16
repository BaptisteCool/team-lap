# Changelog

## 2026-05-16 — 1.0.3

### Public

**Corrections**
- L'automatisation des passages reprend correctement après une action manuelle : un Top manuel ne bloque plus l'auto-pass du tour suivant (auparavant, le cron restait gelé pendant tout le tour qui suit, soit jusqu'à 3 minutes).
- Nouveau délai de grâce de 45 secondes après l'heure théorique de fin de tour : laisse à l'équipe le temps de saisir manuellement le vrai temps en cas de retard, avant que le système ne ferme automatiquement le tour. Configurable par l'administrateur (0 à 300 sec).
- L'allure mesurée lors d'un tour manuel est désormais bien prise en compte comme référence pour le tour suivant, même quand le tour est plus lent que prévu (avant : silencieusement ignoré si hors bornes admin).

### Admin / Technique

**Back (Convex)**
- `convex/lib/timings.ts` : nouvelle constante `cronCooldownAfterManualSec` (10s prod / 1s test) découplée de `replaceAutoWindowSec` (180s, fenêtre UI replace-auto, inchangée). Le cron `autoTick` ne fige plus l'équipe pendant 180s après un manuel.
- `convex/lib/timings.ts` : nouvelle constante `lateGraceSec` (default 45s prod / 2s test).
- `convex/schema.ts` : nouveau champ event-level optionnel `lateGraceSec`.
- `convex/laps.ts` :
  - `recordLap` + `deleteLap` utilisent `cronCooldownAfterManualSec` pour `cronCooldownUntil`.
  - `decideAutoLap` ne fire l'auto que si `elapsed >= expectedLapMs + lateGraceMs`.
  - Calibration `runner.liveKmMin/liveKmSec` post-manuel : bornes relâchées (`>= MIN_LAP_GAP_MS` seulement, pas de borne max — un manuel utilisateur est validé).
  - `decideAutoLap` accepte une `liveLapMs` hors bornes admin.
- `convex/events.ts` : nouvelle mutation `setLateGraceSec` (validation 0–300s).

**Front**
- `src/components/AdminScreen.tsx` : nouvel input event-level « Grâce retard (sec) » à côté de « Transition relai (sec) ».
- `src/components/LiveScreen.tsx` :
  - `expectedLapMs` accepte une `liveLapMs` hors bornes admin (`> 0` seulement).
  - Label « manuel » et marker GPS du circuit lisent `liveKm` sans restriction de bornes.
- `src/routes/admin.tsx` : wiring `setLateGraceSecMutation` + props vers AdminScreen.

**Issues fermées**
- #25 — Relance auto-pass/relai après action manuelle + grâce retard avant fermeture auto

## 2026-05-16 — 1.0.2

### Public

**Nouveautés**
- Vue publique d'une équipe : n'importe qui peut désormais consulter le planning et l'historique d'une équipe via un lien partageable `/team/{id}` (lecture seule), idéal pour les amis et familles des coureurs.
- Bouton « Login » sur la page équipe : permet au gestionnaire de basculer en mode complet en saisissant son code PIN (mémorisé sur l'appareil pour les visites suivantes).
- Marker carte circuit enrichi : sous le nom de l'équipe, affichage du coureur en piste (4 caractères), allure courante (`M'SS`) et tour en cours (`X/N`).

**Améliorations**
- Page équipe en mode visiteur : ne montre que les onglets Planning et Historique, sans aucune action d'écriture (pas d'édition, pas de bouton supprimer, pas de menu de ligne).
- Filtre coureur (Planning « Prochains passages » + Historique) : reste actif en mode visiteur pour suivre uniquement son coureur favori.
- Bouton retour intelligent : affiche « ← Admin » uniquement si un PIN admin a déjà été validé sur l'appareil, sinon « ← Accueil ».

### Admin / Technique

**Front**
- Nouvelle route `/team/$teamId` exploitée comme point d'entrée unique (depuis HomeScreen, click équipe → readonly direct, plus de gate PinGate intermédiaire)
- `team.$teamId.tsx` : auto-unlock manager mode via localStorage `teamlap.team.{id}.pin.{pin}` au mount, Modal PIN inline, sécu bidirectionnelle (force `readonly=true` si URL `readonly=false` sans PIN cached → bloque bypass URL)
- `PlanningScreen` : prop `readonly` → cache « Ordre des relais », « Cycle complet », « Groupes », layout single-column. Garde « Prochains passages »
- `HistoryScreen` : callbacks edit/delete/insert/bulk passés à `undefined` quand readonly → cache sections Classement/Évolution/Historique positions + boutons d'action + menu ligne (⋯)
- `GpxMap` : extension single-marker avec `markerLabel`, `markerSubLabel`, `markerColor` pour atteindre la parité avec les markers multi
- `HomeScreen` + `LiveScreen` : compute `subLabel` avec stint laps (depuis dernier relai), pace `M'SS` apostrophe, format `X/N`
- CSS `.is-readonly` : exemptions pour `.filter-select`, `.filter-input`, `.filter-btn` afin de garder les filtres lecture interactifs

**Sécurité**
- Validation PIN reste **client-side uniquement** dans cette v1 — durcissement Convex serveur (validation PIN sur chaque mutation) reporté à une issue séparée

**Issues fermées**
- #22 — Afficher nom du coureur et tour en cours sur les cartes circuit du dashboard
- #23 — Vue publique équipe `/team/{id}` (lecture seule) + login PIN pour mode gestionnaire

## 2026-05-15 — 1.0.1

### Public

**Nouveautés**
- Météo dans le planning : carte météo cliquable affiche prévisions des prochaines heures, avec choix entre plusieurs sources (Open-Meteo, Met.no, Météo France).
- Mode test admin : permet de tester la logique de course avec des temps au tour de quelques secondes (verrouillé 10 min avant le départ).
- Fin de course manuelle par équipe : bouton "Fin de course" s'affiche après l'heure de fin pour valider l'arrêt de chaque équipe individuellement.
- Cycle théorique vs affiné : compare temps de rotation théorique (snapshot départ) avec temps réel actualisé.
- App installable (PWA) : possibilité d'installer TeamLap sur Android/iOS depuis le navigateur (icône home screen, mode plein écran).
- Notifications de mise à jour : bandeau s'affiche quand une nouvelle version est disponible avec rechargement automatique.
- Icône et nom d'app personnalisés : logo TeamLap visible dans l'onglet, l'écran d'accueil mobile, et la barre d'app.

**Améliorations**
- Header live affiche désormais l'état réel de la course : "Départ dans HH:MM:SS" avant départ, "LIVE écoulé · −restant" pendant, "🏁 Terminée" après.
- Cycle complet du planning affiche le temps théorique (figé au départ) à côté du temps affiné en temps réel, avec écart coloré.
- Bouton "Démarrage tardif" n'apparaît plus si l'équipe est marquée prête au départ.
- Distinction visuelle claire entre environnements (LOCAL violet, PREVIEW orange, PROD vert) sur l'app installée et le titre.

**Corrections**
- Heures estimées des prochains passages corrigées : décalage de 2h en été causé par une mauvaise gestion timezone.
- Réinitialisation de course efface bien les badges "Terminé" et l'état des équipes.
- Filtre coureur dans l'historique conserve l'ordre chronologique.

### Admin / Technique

**Administration**
- Mode test event-level avec lock 10min avant départ (TEST_TIMINGS centralisées dans helper Convex)
- Mutation `events:endRace` (admin "Arrêter événement") + bouton dans AdminScreen
- `resetRace` clear maintenant `actualEnd`, `finishedAt`, `finishedByLap`, `autoPaused`, `cronCooldownUntil`, `groupModeQueue`, `theoreticalCycleMs`

**Infrastructure**
- Vercel env `CONVEX_DEPLOY_KEY` étendu à toutes preview branches (avant: scopé `dev` only)
- `--preview-run seed:seedAll` configuré pour seed auto preview deployments
- Service Worker via `vite-plugin-pwa` (registerType autoUpdate, runtimeCaching NetworkOnly Convex)
- 3 manifests statiques (`manifest.json`, `manifest-local.json`, `manifest-preview.json`) swap runtime selon hostname
- Cache météo Convex TTL 10 min (avant: 1h)
- Convex prod deploy `https://canny-caterpillar-58.convex.cloud` + Vercel prod deploy main branch

**Tooling**
- Convex agent docs (AGENTS.md, CLAUDE.md, skills-lock.json) committés + skills/
- `.gitignore` ajout `.claude/scheduled_tasks.lock` + `.claude/cache/`
- `vite-plugin-pwa` ^1.0.5 + `workbox-window` ^7.4.1 ajoutés (devDeps)

### Issues fermées
#16 ETA timezone fix · #17 cycle théorique · #18 app icons + manifest · #19 header live pill réel · #20 PWA installable + auto-update + env distincts
