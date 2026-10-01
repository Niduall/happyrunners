# Architecture - HappyRunners

## Vue d'ensemble
PWA pour organiser les sorties course du mercredi midi entre collègues.
- **Stack** : React 18 + TypeScript + Vite + Tailwind v4 + Leaflet + Supabase
- **Auth** : localStorage (Prénom/Nom) + PIN 4 chiffres cross-device via Supabase
- **Sync** : Polling 30s (Supabase Realtime instable sur plan gratuit)
- **Deploy** : Vercel (auto-deploy depuis GitHub `main`)

---

## Structure des fichiers

```
src/
├── main.tsx                 # Point d'entrée React
├── App.tsx                  # Router (2 routes: /, /parcours)
├── index.css                # Tailwind + styles globaux
├── types/
│   ├── index.ts             # Types frontend (User, Parcours, Participation, Weather)
│   └── supabase.ts          # Types DB (snake_case) : UserProfile, Participation, Parcours
├── lib/
│   ├── supabase.ts          # Client Supabase
│   └── utils.ts             # Utilitaires (cn, etc.)
├── services/
│   ├── storage.ts           # localStorage wrapper + generateUserId
│   ├── supabaseService.ts   # API Supabase (Parcours, Participations, UserProfiles)
│   ├── weatherApi.ts        # OpenWeatherMap
│   ├── weekKey.ts           # Clé de semaine (mercredi cible) — reset hebdo
│   └── gpxParser.ts         # Parser GPX (XML + JSON Strava)
├── hooks/
│   ├── useAuth.tsx          # AuthProvider (Context) + useAuth + hashPin
│   ├── useParcours.ts       # CRUD parcours + polling 30s
│   ├── useParcoursVotes.ts  # Votes hebdo multi-parcours + roster + polling 30s
│   └── useWeather.ts        # Météo mercredi 12h30
├── components/
│   ├── Auth.tsx             # LoginForm + UserMenu
│   ├── ParcoursVoteCard.tsx # Carte parcours + 2 boutons de vote + compteurs
│   ├── ParticipantsTable.tsx# Tableau récapitulatif + avatars initiales
│   ├── ParcoursCard.tsx     # Affichage parcours
│   ├── WeatherCard.tsx      # Météo
│   ├── MapView.tsx          # Leaflet
│   └── ui/                  # Button, Card, Input
├── pages/
│   ├── Home.tsx             # Météo + parcours + vote
│   └── ParcoursList.tsx     # Liste + création GPX
└── test/
    └── setup.ts             # Config Vitest + mock Supabase
```

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

### Identifiant unique
`generateUserId(firstName, lastName)` — déterministe, cross-browser/OS :
- minuscules, sans accents, sans ponctuation, `_` entre prénom et nom
- `"André" + "Müller"` → `andre_muller`
- **Même nom = même ID = même vote sur tous les appareils**

### PIN
- Hashé côté client (`hashPin`) → base36 préfixé `pin_`
- Stocké **uniquement** en base : `user_profiles.pin_hash`
- **Jamais** dans localStorage
- Coté client uniquement (pas de Supabase Auth) → sécurité faible par conception, suffisant pour un club de collègues

---

## Stockage

| Donnée | localStorage | Supabase (source de vérité) |
|--------|--------------|------------------------------|
| User (Prénom/Nom/ID) | ✅ `running_user` | ❌ |
| PIN hash | ❌ | ✅ `user_profiles.pin_hash` |
| Parcours | (helper legacy) | ✅ `parcours` |
| Votes | (helper legacy) | ✅ `participations` |

`storage.ts` contient aussi des helpers legacy pour parcours/participations qui ne sont **plus utilisés** par l'app (tout passe par Supabase).

---

## Tables Supabase

| Table | PK | Contrainte unique | Colonnes clés |
|-------|-----|-------------------|---------------|
| `parcours` | `id` (uuid) | — | `name`, `distance_km`, `elevation_gain_m`, `points` (jsonb), `created_by` (nullable) |
| `participations` | `id` (uuid) | `(parcours_id, local_user_id, week_key)` | `local_user_id` (text), `status` (yes/no), `week_key`, `first_name`, `last_name`, `user_id` (nullable, legacy) |
| `user_profiles` | `local_user_id` (text) | — | `first_name`, `last_name`, `pin_hash` (nullable) |
| `inscriptions` | `id` (uuid) | `(parcours_id, local_user_id)` | `first_name`, `last_name` |

---

## Polling 30s

| Hook | Intervalle | Contenu |
|------|-----------|----------|
| `useParcours` | 30s | `loadParcours()` |
| `useParcoursVotes` | 30s | votes de la semaine + roster + mes votes |

Aucun composant ne fait sa propre écoute — tout passe par un hook unique.

---

## Cycle de vote hebdomadaire

Le cycle va du **jeudi** au **mercredi suivant** (reset le jeudi matin, run le mercredi midi).

`getCurrentWeekKey()` retourne la date du mercredi cible, format `"2026-10-07"`.

| Jour | Mercredi cible | Effet |
|------|----------------|-------|
| dimanche → mercredi | dans la même semaine | vote en cours |
| jeudi → samedi | **mercredi suivant** | nouveau cycle (reset auto) |

Le reset est **automatique** : pas de cron, pas de purge. Les anciens votes restent
en base (historique) mais ne sont plus affichés.

### Clé de vote
`UNIQUE (parcours_id, local_user_id, week_key)` → 1 vote par personne, par parcours, par semaine.

### Roster
`getRoster()` = toutes les personnes ayant déjà voté (historique complet). Sert à
compter les "en attente" cette semaine via `pendingCount`.

### Tri
`rankedParcoursIds` trie par nombre de votes "yes" décroissant. Le 1er avec ≥1 vote
est marqué "En tête" (le parcours retenu pour le run).

---

## Tests

```bash
npm test          # run unique
npm test:watch    # watch mode
```

| Fichier | Couvre |
|---------|--------|
| `src/services/storage.test.ts` | `generateUserId` (casse, accents, espaces, ponctuation, Unicode), `createUser` |
| `src/hooks/useAuth.test.ts` | `hashPin` (déterminisme, format, zéros en tête) |
| `src/hooks/useAuth.integration.test.ts` | Flux complet : first_login, création, PIN, nouvel appareil, reconnexion, robustesse |

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
7. **13 vulnérabilités npm** (9 moderate, 1 high, 3 critical) — non traitées, à évaluer
