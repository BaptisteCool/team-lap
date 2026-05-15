# Changelog

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
