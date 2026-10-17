# AGENTS.md - Running Club App

## ⛔ RÈGLE ABSOLUE — NE JAMAIS PUSHER SANS ACCORD

**`git push` est interdit tant que l'utilisateur n'a pas explicitement validé.**

Avant chaque push, tu DOIS :
1. Lister les fichiers modifiés
2. Expliquer ce que chaque changement fait et **pourquoi**
3. Montrer le résultat de `npm test` et `npm run build`
4. Attendre un accord explicite (« go », « ok », « validé », « pousse »)

`git commit` local est autorisé. `git push` ne l'est pas.

Cette règle a été ajoutée parce que des modifications non testées ont été poussées en production et ont cassé l'auth à plusieurs reprises.

---

## Project Overview
PWA pour organiser les courses du mercredi midi entre collègues.
React 18 + TypeScript + Vite + Tailwind v4 + Leaflet + Supabase.

**Voir `ARCHITECTURE.md` pour la cartographie complète** (machine à états, tables, flux, points d'attention).

## Key Commands
```bash
npm run dev        # Dev server
npm run build      # TypeScript check + Vite build
npm run preview    # Preview production build
npm test           # Unit + integration tests (Vitest)
npm test:watch     # Watch mode
```

## Workflow obligatoire avant livraison
```bash
npm test           # 30 tests doivent passer
npm run build      # 0 erreur TypeScript
# puis : présenter les changements, attendre validation, puis push
```

## Architecture (résumé)
- **SPA**: React 18 + React Router
- **PWA**: vite-plugin-pwa, autoUpdate
- **Auth**: Prénom/Nom → `user_number` (entier attribué par la base, **jamais dérivé du nom**). PIN 4 chiffres hashé stocké en base (`user_profiles.pin_hash`), jamais en localStorage
- **State**: Supabase = source de vérité. localStorage = cache utilisateur local
- **Polling**: 30s pour parcours + participations

## Key Files
| File | Purpose |
|------|---------|
| `src/hooks/useAuth.tsx` | `AuthProvider` (Context) + `useAuth` |
| `src/services/pin.ts` | `hashPin` (hash simple côté client) |
| `src/hooks/useParcours.ts` | Parcours CRUD + 30s polling |
| `src/hooks/useParcoursVotes.ts` | Votes hebdo multi-parcours + roster + 30s polling — **source unique** |
| `src/hooks/useWeather.ts` | Météo mercredi 12h30 |
| `src/services/supabaseService.ts` | API Supabase |
| `src/services/storage.ts` | cache utilisateur local (invalide les ids non entiers) |
| `src/services/gpxParser.ts` | GPX (XML + JSON Strava) |
| `src/services/weatherApi.ts` | Open-Meteo (16 jours, sans clé) |
| `src/services/weatherCode.ts` | Codes WMO → emoji |
| `src/components/Auth.tsx` | LoginForm + UserMenu |
| `src/components/ParcoursVoteCard.tsx` | Carte parcours + 2 boutons de vote |
| `src/components/ParticipantsTable.tsx` | Tableau récapitulatif + avatars |

## Critical Implementation Details

### Auth — machine à états + Context
```
loading → first_login | pin_verification → authenticated
```

**`useAuth()` est un Context (`AuthProvider` monté dans `main.tsx`).**
C'est NON NÉGOCIABLE : sans ça, chaque composant a son propre état et on obtient
« Bonjour undefined undefined » + champs PIN manquants. Ce bug a coûté plusieurs
itérations. `useAuth()` hors provider → throw explicite plutôt qu'un état silencieux faux.
- `loading` → `first_login` : pas de user en localStorage
- `loading` → `pin_verification` : profil en base avec `pin_hash`
- `createUserProfile()` vérifie la base **avant** de créer — si un PIN existe, bascule en `pin_verification` et **n'écrase jamais** le PIN
- `verifyUserPin()` appelle `ensureLocalUser()` **avant** `setMode('authenticated')`
- `logout()` remet `first_login` — **pas** de rechargement nécessaire

### ⚠️ Ne PAS utiliser de rechargement de page dans les flux d'auth
Les anciens bugs venaient de `window.location.href = '/'` qui causait des boucles d'état. L'hydratation est maintenant correcte via le state machine. Si tu penses avoir besoin d'un rechargement, vérifie d'abord si un état manque dans `useAuth`.

### Identifiant unique : `user_number`
Entier attribué par la base (1, 2, 3…), **jamais modifié**.
- Changer son nom ne touche PAS l'identifiant → votes, PIN et historique suivent
- `findProfileByName(firstName, lastName)` retrouve le numéro sur un autre appareil
- Les noms sont lus via JOIN sur `user_profiles`, jamais dupliqués
- ⚠️ Ne jamais réintroduire un identifiant dérivé du nom : c'est la source du bug
  « changer de nom casse les votes »

### GPX Parsing
- Formats : XML GPX, JSON Strava `{ "points": [...] }`, flat array, segments, track.segments
- Retourne `{ distance_km, elevation_gain_m, points[] }`

### Polling
- `useParcours.ts` : `setInterval(loadParcours, 30000)`
- `useParcoursVotes.ts` : `setInterval(loadAll, 30000)`
- Aucun composant ne doit implémenter sa propre écoute

### Cycle : mercredi 14h → mercredi 14h
- `getCurrentWeekKey()` = date du mercredi cible (`"2026-10-07"`)
- Le run est le mercredi 12h30 ; **à 14h** l'app bascule sur le suivant
- Bascule automatique (pas de cron), y compris si l'app reste ouverte
- `useTargetWednesday()` fournit l'horloge partagée (tick 1 min) : à **consommer**
  dans tout hook qui a besoin de la clé de semaine, sinon le hook fige sa clé au
  montage et affiche le run d'hier
- Cache météo lié à la semaine (`weather_cache_<weekKey>`) → invalidé à la bascule

### Météo — Open-Meteo
- **Aucune clé API** (contrairement à OpenWeather). Ne pas en réintroduire une.
- 16 jours de prévision, 384 heures horaires, `timezone=Europe/Paris`
- Vent **déjà en km/h** : ne pas multiplier par 3.6 (bug OpenWeather)
- `precipitation_probability` est en **pourcent** → normaliser en 0..1
- Tolérance de sélection : ±90 min autour de 12h30
- `isDay` forcé à `true` pour la prévision du run (toujours à 12h30)
- Icônes via `weatherCode.ts` (mapping WMO → emoji), pas d'images externes
- Hors couverture → `getRunForecast` renvoie `null`, l'app affiche la météo du
  jour avec un badge explicite

### Verrou admin (suppression / modification des parcours)
- Défini par `VITE_ADMIN_CODE`. **Variable absente = aucun cadenas** : ne
  jamais bloquer l'admin par surprise sur un déploiement non configuré.
- L'**import GPX reste libre** pour tous. Seules la suppression et la
  modification demandent le code.
- ⚠️ Le déverrouillage est un **état local à `ParcoursList`** (`useState`).
  **Ne pas le remettre dans `useAuth` ni dans `sessionStorage`** : c'était
  l'implémentation précédente, et elle laissait l'accès ouvert à tout l'onglet,
  y compris après un changement d'utilisateur. Le verrou doit mourir avec la
  page.
- `adminCode.ts` ne mémorise rien (volontaire) : il ne fait que lire et
  comparer le code.
- Le profil arrive de façon asynchrone : une première résolution d'identité
  n'est pas un changement. Reverrouiller naïvement sur `[user?.id]` efface un
  déverrouillage saisi pendant le chargement (course couverte par un test).
- Conséquence assumée : un **rechargement de page redemande le code**.

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Oui | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Oui | Supabase anon key (**régénérable** — copier depuis le dashboard si "Invalid API key") |
| ~~`VITE_OPENWEATHER_API_KEY`~~ | **Supprimé** | Open-Meteo n'a pas besoin de clé |
| `VITE_DEFAULT_LAT` | Default: 48.6833 | Latitude (Tomblaine) |
| `VITE_DEFAULT_LON` | Default: 6.2167 | Longitude (Tomblaine) |

## Database Schema

**Source de vérité : `schema.sql`.** Ce fichier est rejouable tel quel sur une
base vide. Ne jamais décrire le schéma dans la prose ci-dessous : c'est ainsi
que ce document avait fini par annoncer un `participations(local_user_id)`
qui n'existait plus depuis la migration `user_number`.

### Les 4 tables
| Table | Clé | Particularité |
|---|---|---|
| `user_profiles` | `user_number` (SEQUENCE) | identifiant **stable**, indépendant du nom |
| `parcours` | `id` uuid | `points` jsonb = tracé GPX |
| `attendances` | `UNIQUE(week_key, user_number)` | `going` \| `skip` |
| `participations` | `UNIQUE(user_number, week_key)` | **un seul parcours par personne et par semaine** |

### Points non négociables
- `participations.parcours_id` est en **`ON DELETE CASCADE`** : supprimer un
  parcours emporte ses votes. C'est ce que la confirmation annonce.
- `onConflict` des votes = **`user_number,week_key`**, jamais `parcours_id`.
- La séquence `user_number` est irremplaçable. La perdre casse la création.
- `profiles` et `responses` sont des tables **mortes** (ancien identifiant
  dérivé du nom). `schema.sql` les supprime ; ne pas les recréer.

### Sauvegarde
```bash
python3 backup.py save              # exporte la prod (hors dépôt)
python3 backup.py list              # backups disponibles
python3 backup.py restore <fichier> # ⚠️ remplace le contenu des tables
```

## Testing
```bash
npm test
```
| Fichier | Couvre |
|---------|--------|
| `src/services/storage.test.ts` | cache utilisateur local |
| `src/hooks/useAuth.hash.test.tsx` | `hashPin` (6 tests) |
| `src/hooks/useAuth.integration.test.tsx` | Flux auth complet + partage d'état (16 tests) |
| `src/services/weekKey.test.ts` | Bascule 14h, passage d'année, bissextile (37 tests) |
| `src/services/weatherApi.test.ts` | Parsing Open-Meteo, couverture 16 j (23 tests) |
| `src/services/weatherCode.test.ts` | Mapping des 28 codes WMO, jour/nuit (15 tests) |
| `src/hooks/useParcoursVotes.test.tsx` | Votes hebdo, tri, pendingCount, optimisme (10 tests) |
| `src/test/setup.ts` | Mock Supabase global + cleanup |

Ajouter un test pour toute nouvelle logique d'auth ou d'identification.

## Deployment
- GitHub : `Niduall/happyrunners` (branche `main`)
- Vercel auto-deploy au push sur `main` → **nécessite validation utilisateur avant push**
- Env vars : Vercel Dashboard → Settings → Environment Variables

## Common Pitfalls to Avoid
1. **⛔ Ne jamais `git push` sans accord explicite de l'utilisateur**
2. **Ne pas dupliquer la logique de vote** — un seul `useParcoursVotes`
2b. **Toujours passer par `castWeekVote()`** — un vote sans `week_key` est invisible dans le tableau
3. **`pendingUser` requis** pour `verifyUserPin` — sans lui retourne `false`
4. **Ne pas écraser un `pin_hash` existant** lors d'une "création" de compte
4b. **Ne jamais recréer `useAuth` sans Context** — l'état doit être partagé, pas dupliqué
5. **Tester en navigation privée** (Ctrl+Shift+N) — le cache Vercel masque les changements
6. **`onConflict` des votes** doit être `user_number,week_key` — un seul parcours par personne et par semaine
7. **Realtime instable** sur plan gratuit → polling 30s
7b. **Consommer `useTargetWednesday()`** plutôt que `getCurrentWeekKey()` figé au montage
7c. **Météo : vent déjà en km/h** — ne pas reconvertir (Open-Meteo ≠ OpenWeather)
7d. **`useTargetWednesday()` obligatoire** dans tout hook qui lit la semaine
8. **`npm test` + `npm run build` obligatoires** avant de présenter un changement

## Known Issues
- 13 vulnérabilités npm (9 moderate, 1 high, 3 critical) — non traitées
- Bundle 718 kB (>500 kB) — warning Vite, pas bloquant
- Sécurité du PIN faible par conception (hash client simple, pas d'auth serveur) — acceptable pour un club de collègues, **pas** pour un usage réel
