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
- **Auth**: Prénom/Nom → `generateUserId()` déterministe. PIN 4 chiffres hashé stocké en base (`user_profiles.pin_hash`), jamais en localStorage
- **State**: Supabase = source de vérité. localStorage = cache utilisateur local
- **Polling**: 30s pour parcours + participations

## Key Files
| File | Purpose |
|------|---------|
| `src/hooks/useAuth.tsx` | `AuthProvider` (Context) + `useAuth` + `hashPin` |
| `src/hooks/useParcours.ts` | Parcours CRUD + 30s polling |
| `src/hooks/useParcoursVotes.ts` | Votes hebdo multi-parcours + roster + 30s polling — **source unique** |
| `src/hooks/useWeather.ts` | Météo mercredi 12h30 |
| `src/services/supabaseService.ts` | API Supabase |
| `src/services/storage.ts` | localStorage + `generateUserId` |
| `src/services/gpxParser.ts` | GPX (XML + JSON Strava) |
| `src/services/weatherApi.ts` | OpenWeatherMap |
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

### Identifiant unique
`generateUserId(firstName, lastName)` : minuscules, sans accents, sans ponctuation, `_` entre les deux.
- `"André" + "Müller"` → `andre_muller`
- Doit rester **déterministe** cross-browser/OS (tout test dépend de ça)

### GPX Parsing
- Formats : XML GPX, JSON Strava `{ "points": [...] }`, flat array, segments, track.segments
- Retourne `{ distance_km, elevation_gain_m, points[] }`

### Polling
- `useParcours.ts` : `setInterval(loadParcours, 30000)`
- `useParcoursVotes.ts` : `setInterval(loadAll, 30000)`
- Aucun composant ne doit implémenter sa propre écoute

### Cycle de vote hebdomadaire
- `getCurrentWeekKey()` = date du mercredi cible (`"2026-10-07"`)
- Cycle du **jeudi** au mercredi suivant → le reset est automatique, sans cron
- Tout nouveau vote DOIT passer par `castWeekVote()` qui pose `week_key`
- Contrainte UNIQUE : `(parcours_id, local_user_id, week_key)`

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Oui | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Oui | Supabase anon key (**régénérable** — copier depuis le dashboard si "Invalid API key") |
| `VITE_OPENWEATHER_API_KEY` | Oui | OpenWeatherMap API key |
| `VITE_DEFAULT_LAT` | Default: 48.6833 | Latitude (Tomblaine) |
| `VITE_DEFAULT_LON` | Default: 6.2167 | Longitude (Tomblaine) |

## Database Schema

### `user_profiles`
```sql
local_user_id TEXT PRIMARY KEY,  -- = generateUserId(firstName, lastName)
first_name TEXT NOT NULL,
last_name TEXT NOT NULL,
pin_hash TEXT,                   -- NULL = pas de PIN
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### `participations`
```sql
UNIQUE (parcours_id, local_user_id)  -- ⚠️ pas (parcours_id, user_id)
user_id UUID NULL                    -- legacy, toujours NULL
```

## Testing
```bash
npm test
```
| Fichier | Couvre |
|---------|--------|
| `src/services/storage.test.ts` | `generateUserId`, `createUser` |
| `src/hooks/useAuth.hash.test.tsx` | `hashPin` (6 tests) |
| `src/hooks/useAuth.integration.test.tsx` | Flux auth complet + partage d'état (16 tests) |
| `src/services/weekKey.test.ts` | Cycle de vote, passage d'année, bissextile (24 tests) |
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
6. **`onConflict` des votes** doit être `parcours_id,local_user_id`
7. **Realtime instable** sur plan gratuit → polling 30s
8. **`npm test` + `npm run build` obligatoires** avant de présenter un changement

## Known Issues
- 13 vulnérabilités npm (9 moderate, 1 high, 3 critical) — non traitées
- Bundle 718 kB (>500 kB) — warning Vite, pas bloquant
- Sécurité du PIN faible par conception (hash client simple, pas d'auth serveur) — acceptable pour un club de collègues, **pas** pour un usage réel
