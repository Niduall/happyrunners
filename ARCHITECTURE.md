# Architecture - HappyRunners

## Vue d'ensemble
PWA pour organiser les sorties course du mercredi midi entre collègues.
- **Stack** : React 19 + TypeScript + Vite + Tailwind v4 + Leaflet + Supabase
- **Auth** : localStorage (Prénom/Nom) + PIN 4 chiffres cross-device via Supabase
- **Sync** : Polling 30s (Supabase Realtime instable sur plan gratuit)
- **Deploy** : Vercel (auto-deploy depuis GitHub `main`)

---

## Structure des fichiers

Inventaire exhaustif, fichier par fichier : **`CARTOGRAPHIE.md` §2**.

| Couche | Dossier | Rôle |
|---|---|---|
| Entrée / routage | `src/main.tsx`, `src/App.tsx` | monte l'app, 2 routes |
| Pages | `src/pages/` | `Home`, `ParcoursList` |
| Composants | `src/components/` | UI métier + `ui/` génériques |
| Hooks | `src/hooks/` | état et polling |
| Services | `src/services/` | Supabase, GPX, météo, semaine, PIN, code admin |
| Types | `src/types/` | types applicatifs et lignes DB |

---

## Machine à états Auth (`useAuth.tsx`)

### ⚠️ useAuth est un Context — un seul état partagé
`useAuth()` **doit** être consommé via le `useContext` interne. C'est ce qui empêche
le bug « Bonjour undefined undefined » où chaque composant avait son propre état.

`<AuthProvider>` est monté dans `src/main.tsx` et enveloppe toute l'app.
Si `useAuth()` est appelé hors provider → throw explicite.

Appeler `useAuth()` plusieurs fois **partage le même état** (c'est le but).

```
loading
  │
  ├─► first_login              pas de user en localStorage
  │     └─ createUserProfile(firstName, lastName, pin?)
  │           ├─ vérifie user_profiles en base
  │           │     ├─ pin_hash existe → pin_verification (NE PAS écraser le PIN)
  │           │     └─ pas de pin_hash → authenticated + upsert profil
  │           └─ retourne true (créé) / false (bascule en pin_verification)
  │
  ├─► pin_verification         profil en base avec pin_hash
  │     └─ verifyUserPin(pin)
  │           ├─ correct → ensureLocalUser() + authenticated
  │           └─ faux    → false (reste en pin_verification)
  │
  └─► authenticated            connecté
        └─ logout() → first_login
```

### PIN
- Hashé côté client (`hashPin`) → base36 préfixé `pin_`
- Stocké **uniquement** en base : `user_profiles.pin_hash`
- **Jamais** dans localStorage
- Coté client uniquement (pas de Supabase Auth) → sécurité faible par conception, suffisant pour un club de collègues

> L'ancien `generateUserId(firstName, lastName)` a été **supprimé**. Un
> identifiant dérivé du nom est la source du bug « changer de nom casse les
> votes ». Voir la section « Identité : `user_number` » ci-dessous.

---

## Identité : `user_number`

L'identifiant technique est un **entier attribué par la base** (1, 2, 3…),
pas une chaîne dérivée du nom. Conséquence : **changer son nom ne casse rien** —
les votes, le PIN et l'historique restent attachés à la bonne personne.

Avant : `local_user_id = "paul_martin"` (dérivé du nom → change avec le nom)
Après : `user_number = 1` (stable, jamais modifié)

Les noms sont lus via un JOIN sur `user_profiles` — ils ne sont plus dupliqués
dans `attendances` ni `participations`.

Reconnexion sur un autre appareil : on retrouve son `user_number` via
`findProfileByName(firstName, lastName)`.

## Stockage

| Donnée | localStorage | Supabase (source de vérité) |
|--------|--------------|------------------------------|
| User (Prénom/Nom/user_number) | ✅ `running_user` (cache) | ✅ `user_profiles` |
| PIN hash | ❌ | ✅ `user_profiles.pin_hash` |
| Parcours | ❌ | ✅ `parcours` |
| Votes | ❌ | ✅ `participations` |

`storage.ts` ne conserve que le cache utilisateur (`getUser`/`setUser`/`clearUser`). Les anciens helpers parcours/participations ont été retirés en tâche 13 : tout passe par Supabase.

---

## Tables Supabase

| Table | PK | Contrainte unique | Colonnes clés |
|-------|-----|-------------------|---------------|
| `parcours` | `id` (uuid) | — | `name`, `distance_km`, `elevation_gain_m`, `points` (jsonb), `created_by` (nullable) |
| `participations` | `id` (uuid) | **`(user_number, week_key)`** | `parcours_id` (FK, **CASCADE**), `user_number`, `status` (yes/no), `week_key` |
| `attendances` | `id` (uuid) | **`(week_key, user_number)`** | `user_number`, `status` (going/skip), `week_key` |
| `user_profiles` | `id` (uuid) | `user_number` | `user_number` (SEQUENCE, **stable**), `first_name`, `last_name`, `pin_hash` (nullable) |

> ⚠️ `participations` est en `UNIQUE(user_number, week_key)` : une personne ne
> peut être comptée que sur **un seul parcours** par semaine. Le `onConflict`
> de `castWeekVote()` doit refléter cet ordre, sinon l'upsert échoue.
>
> `profiles` et `responses` sont des tables mortes (ancien identifiant dérivé
> du nom). `schema.sql` les supprime.
---

## Polling 30s

| Hook | Intervalle | Contenu |
|------|-----------|----------|
| `useParcours` | 30s | `loadParcours()` |
| `useAttendance` | 30s | présences de la semaine |
| `useParcoursVotes` | 30s | votes de la semaine + roster + mes votes |

Aucun composant ne fait sa propre écoute — tout passe par un hook dédié.

---

## Cycle : mercredi 14h → mercredi 14h

Le run a lieu le mercredi à 12h30. À **14h** il est terminé, donc l'app bascule
sur le run suivant — météo, votes, tableau, tout d'un coup.

`getCurrentWeekKey()` retourne la date du mercredi cible, format `"2026-10-07"`.

| Moment | Cible | Effet |
|--------|-------|-------|
| dimanche → mercredi 13h | mercredi en cours | vote en cours |
| **mercredi 14h** | **mercredi suivant** | **bascule** |
| mercredi 15h → samedi | mercredi suivant | nouveau cycle |

Le reset est **automatique** : pas de cron, pas de purge. Les anciens votes restent
en base (historique) mais ne sont plus affichés.

### Bascule à 14h tapantes
`useTargetWednesday()` fournit une horloge partagée (tick 30 s) consommée par
`useAttendance`, `useParcoursVotes`, `useWeather` et `Home`. Sans ça, chaque hook
figerait sa clé au montage et l'app afficherait le run d'hier toute la soirée.

### Cache météo lié à la semaine
Clé `weather_cache_<weekKey>` : quand la cible change à 14h, le cache est
automatiquement invalidé et les anciennes entrées purgées.

### Clé de vote
`UNIQUE (user_number, week_key)` → **un seul choix de parcours par personne et par semaine**.
Changer de parcours remplace le précédent (upsert sur cette contrainte).

### Présence
`getWeekAttendances(weekKey)` interroge `attendances`, puis `user_profiles`
pour récupérer les noms : ce sont **deux requêtes**, pas un JOIN SQL. Les noms
ne sont pas dupliqués dans chaque table.

### Tri
`rankedParcoursIds` trie par nombre de votes "yes" décroissant. Le 1er avec ≥1 vote
est marqué "En tête" (le parcours retenu pour le run).

---

## Météo — Open-Meteo

**Aucune clé API requise.** Migration faite depuis OpenWeatherMap (5 jours max en gratuit).

```
https://api.open-meteo.com/v1/forecast
  ?latitude=48.68&longitude=6.22
  &hourly=temperature_2m,apparent_temperature,relative_humidity_2m,
          wind_speed_10m,wind_direction_10m,wind_gusts_10m,
          precipitation_probability,weather_code
  &daily=weather_code,temperature_2m_max,temperature_2m_min,
         precipitation_probability_max,sunrise,sunset
  &current=...
  &timezone=Europe/Paris&forecast_days=16
```

Les heures renvoyées sont des heures murales `Europe/Paris` **sans suffixe** :
elles doivent être parsées dans ce fuseau (`isoToEpoch`), pas dans celui du
navigateur.

| Avantage sur OpenWeather | Avant | Après |
|--------------------------|-------|-------|
| Couverture | 5 jours | **16 jours** |
| Clé API | requise (et cassée une fois) | **aucune** |
| Vent | m/s à convertir | **déjà en km/h** |
| Rafales / pluie | absents | inclus |
| Quota | 60/min | 10 000/jour |

### Codes WMO → emoji

`src/services/weatherCode.ts` mappe les 28 codes WMO vers un emoji + couleurs.
Le run est à 12h30 → toujours `isDay: true`. La variante nuit (🌙) ne concerne
que la météo de secours.

| Code | WMO | Emoji |
|------|-----|-------|
| 0 | Ensoleillé | ☀️ (🌙 la nuit) |
| 1-2 | Peu/partiellement nuageux | 🌤️ ⛅ |
| 3 | Nuageux | ☁️ |
| 45,48 | Brouillard | 🌫️ |
| 51-57 | Bruine | 🌦️ 🌧️ |
| 61-67 | Pluie | 🌧️ |
| 71-77,85-86 | Neige | ❄️ 🌨️ |
| 80-82 | Averses | 🌦️ ⛈️ |
| 95-99 | Orage | ⛈️ |

### Sélection de la prévision du run

`getRunForecast()` cherche la période horaire la plus proche de 12h30, avec une
tolérance de ±90 min. Les 384 heures sont conservées (et non 8 comme avant).

⚠️ Bug historique : `forecast.list.slice(0, 8)` sur l'API OpenWeather ne gardait
que ~24 h sur 40, donc la prévision disparaissait dès le lendemain. Test de
non-régression dans `weatherApi.test.ts` (vérifié en échec sans le fix).

## Tests

```bash
npm run lint      # ESLint (TypeScript + règles React hooks)
npm test          # run unique
npm test:watch    # watch mode
```

| Fichier | Couvre |
|---------|--------|
| `src/services/storage.test.ts` | cache local, invalidation des ids non entiers |
| `src/services/gpxParser.test.ts` | XML/JSON GPX, distance, dénivelé, simplification, bounds |
| `src/services/pin.test.ts` | `hashPin` (déterminisme, format, zéros en tête) |
| `src/hooks/useAuth.integration.test.tsx` | Flux complet : first_login, création, PIN, nouvel appareil, reconnexion, robustesse |

Supabase est mocké globalement dans `src/test/setup.ts` — aucun appel réseau en test.

---

## Points d'attention

1. **Un seul `useParcoursVotes`** — ne jamais dupliquer la logique de vote dans un composant
1b. **`week_key` obligatoire** sur tout nouveau vote — sans lui le vote est invisible du tableau
2. **`pendingUser` est requis** pour `verifyUserPin` — sans lui, retourne `false`
3. **`ensureLocalUser` valide l'ID** — un user local dont l'ID ne correspond pas est recréé
4. **Pas de `window.location.href` dans les flux d'auth** — l'hydratation est correcte via le state machine
5. **Vercel cache** — tester **uniquement en navigation privée** (Ctrl+Shift+N)
6. **Types dupliqués** : `types/index.ts` (frontend camelCase) vs `types/supabase.ts` (DB snake_case)
7. **Vulnérabilités npm** — non traitées, à évaluer (`npm audit` pour le détail et le compte à jour)
