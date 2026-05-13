# Configuration de Convex en Localhost

## Installation et Configuration

### 1. Installer le CLI Convex

```bash
npm install -g convex
```

Ou utiliser npx sans installation globale :
```bash
npx convex dev
```

### 2. Initialiser un Projet Convex Local

```bash
npx convex dev
```

Cette commande va :
- Créer un nouveau projet Convex
- Générer le dossier `convex/_generated`
- Créer le fichier `.env` avec `VITE_CONVEX_URL`
- Démarrer le serveur de développement Convex

### 3. Structure des Fichiers Convex

Après l'initialisation, vous aurez :

```
convex/
├── _generated/          # Fichiers générés automatiquement
│   ├── api.ts          # Types TypeScript pour les fonctions
│   └── server.ts       # Types pour le serveur
├── schema.ts           # Schéma de la base de données
└── functions.ts        # Queries et mutations
```

### 4. Fichier .env

Le fichier `.env` sera créé automatiquement avec :

```env
VITE_CONVEX_URL=http://127.0.0.1:3210
```

**Important :** Ajoutez `.env` à votre `.gitignore` pour ne pas committer vos secrets.

## Démarrage du Serveur Convex

### Option 1 : Développement Local (Recommandé)

```bash
npx convex dev
```

Cela démarre :
- Un serveur Convex local sur `http://127.0.0.1:3210`
- Une synchronisation automatique avec le cloud (optionnel)
- Le rechargement à chaud des fonctions

### Option 2 : Développement Local Sans Cloud

```bash
npx convex dev --no-cloud
```

Cela démarre un serveur Convex entièrement local sans synchronisation cloud.

### Option 3 : Dashboard Local

```bash
npx convex dashboard
```

Ouvre le dashboard Convex dans votre navigateur pour visualiser et gérer vos données.

## Vérification de la Connexion

### 1. Vérifier que le Serveur Tourne

Ouvrez `http://127.0.0.1:3210` dans votre navigateur. Vous devriez voir l'interface Convex.

### 2. Tester avec une Requête Simple

Créez un fichier de test `convex/test.ts` :

```typescript
import { query } from './_generated/server'

export const hello = query({
  handler: async () => {
    return "Hello from Convex!"
  }
})
```

Puis testez dans votre application React :

```typescript
import { useQuery } from 'convex/react'

function TestComponent() {
  const hello = useQuery(api.test.hello)
  return <div>{hello}</div>
}
```

## Dépannage

### Erreur : "Convex encountered an error loading page"

**Solution 1 : Redémarrer le serveur Convex**
```bash
# Arrêter le serveur (Ctrl+C)
# Puis redémarrer
npx convex dev
```

**Solution 2 : Nettoyer le cache**
```bash
# Supprimer le dossier _generated
rm -rf convex/_generated

# Redémarrer
npx convex dev
```

**Solution 3 : Vérifier le port**
```bash
# Vérifier si le port 3210 est utilisé
lsof -i :3210

# Si utilisé, tuer le processus
kill -9 <PID>
```

**Solution 4 : Réinitialiser le projet**
```bash
# Supprimer le dossier .env et _generated
rm -rf convex/_generated .env

# Réinitialiser
npx convex dev
```

### Erreur : "Cannot connect to Convex"

**Vérifier :**
1. Que le serveur Convex tourne (`npx convex dev`)
2. Que le fichier `.env` contient `VITE_CONVEX_URL=http://127.0.0.1:3210`
3. Que votre application React peut accéder à localhost

### Erreur : "Module not found: './_generated/server'"

**Solution :**
```bash
# Le dossier _generated n'existe pas encore
# Démarrez le serveur Convex pour le générer
npx convex dev
```

## Workflow de Développement

### 1. Démarrer Convex (Terminal 1)
```bash
npx convex dev
```

### 2. Démarrer Vite (Terminal 2)
```bash
npm run dev
```

### 3. Développer
- Modifiez `convex/schema.ts` ou `convex/functions.ts`
- Convex détecte les changements automatiquement
- Le dossier `_generated` est mis à jour
- Votre application React se recharge automatiquement

## Gestion des Données

### Via le Dashboard

```bash
npx convex dashboard
```

Dans le dashboard, vous pouvez :
- Voir toutes les tables
- Ajouter/Modifier/Supprimer des documents
- Exécuter des queries et mutations
- Voir les logs

### Via le CLI

```bash
# Lister les documents d'une table
npx convex data list teams

# Ajouter un document
npx convex data insert teams '{"name": "Team 1", "pin": "1234"}'

# Supprimer un document
npx convex data delete teams <id>
```

## Déploiement

### Déployer vers Convex Cloud

```bash
npx convex deploy
```

Cela déploie votre schéma et vos fonctions vers le cloud Convex.

### Basculer entre Local et Cloud

**Pour le développement local :**
```env
VITE_CONVEX_URL=http://127.0.0.1:3210
```

**Pour la production :**
```env
VITE_CONVEX_URL=https://your-project.convex.cloud
```

## Bonnes Pratiques

1. **Toujours démarrer Convex avant Vite**
   ```bash
   # Terminal 1
   npx convex dev
   
   # Terminal 2
   npm run dev
   ```

2. **Utiliser .env.local pour le développement**
   ```bash
   cp .env.example .env.local
   ```

3. **Ne jamais committer .env**
   ```gitignore
   .env
   .env.local
   .env.*.local
   ```

4. **Vérifier les types après les changements**
   ```bash
   npx convex typecheck
   ```

5. **Utiliser le dashboard pour le débogage**
   ```bash
   npx convex dashboard
   ```

## Ressources

- Documentation Convex : https://docs.convex.dev
- Guide de démarrage rapide : https://docs.convex.dev/quickstart
- CLI Reference : https://docs.convex.dev/cli

## Résumé des Commandes

```bash
# Installation
npm install -g convex

# Développement
npx convex dev              # Démarrer le serveur local
npx convex dev --no-cloud   # Sans synchronisation cloud
npx convex dashboard        # Ouvrir le dashboard

# Déploiement
npx convex deploy           # Déployer vers le cloud

# Données
npx convex data list <table>      # Lister les documents
npx convex data insert <table>    # Ajouter un document
npx convex data delete <table> <id>  # Supprimer un document

# Types
npx convex typecheck         # Vérifier les types
```

## Problèmes Courants

### Le serveur Convex ne démarre pas
- Vérifiez que Node.js 18+ est installé
- Essayez `npx convex dev --no-cloud`
- Vérifiez que le port 3210 n'est pas utilisé

### Les types ne sont pas générés
- Assurez-vous que `convex/schema.ts` existe
- Redémarrez `npx convex dev`
- Supprimez `convex/_generated` et redémarrez

### L'application ne se connecte pas
- Vérifiez que `.env` contient `VITE_CONVEX_URL`
- Assurez-vous que le serveur Convex tourne
- Vérifiez la console du navigateur pour les erreurs