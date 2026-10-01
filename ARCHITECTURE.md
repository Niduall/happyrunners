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
│   └── gpxParser.ts         # Parser GPX (XML + JSON Strava)
├── hooks/
│   ├── useAuth.tsx          # AuthProvider (Context) + useAuth + hashPin
│   ├── useParcours.ts       # CRUD parcours + polling 30s
│   ├── useParticipation.ts  # Votes + polling 30s (source unique)
│   └── useWeather.ts        # Météo mercredi 12h30
├── components/
│   ├── Auth.tsx             # LoginForm + UserMenu
│   ├── ParticipationBtn.tsx # Wrapper mince sur useParticipation
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
| `participations` | `id` (uuid) | `(parcours_id, local_user_id)` | `local_user_id` (text), `status` (yes/no), `user_id` (nullable, legacy) |
| `user_profiles` | `local_user_id` (text) | — | `first_name`, `last_name`, `pin_hash` (nullable) |

---

## Polling 30s

| Hook | Intervalle | Contenu |
|------|-----------|----------|
| `useParcours` | 30s | `loadParcours()` + `subscribeToParcours` (realtime, non critique) |
| `useParticipation` | 30s | `loadMyVote()` + `loadCounts()` |

`ParticipationBtn.tsx` ne fait **plus** sa propre écoute — il délègue à `useParticipation`.

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

1. **Un seul `useParticipation`** — ne jamais dupliquer la logique de vote dans un composant
2. **`pendingUser` est requis** pour `verifyUserPin` — sans lui, retourne `false`
3. **`ensureLocalUser` valide l'ID** — un user local dont l'ID ne correspond pas est recréé
4. **Pas de `window.location.href` dans les flux d'auth** — l'hydratation est correcte via le state machine
5. **Vercel cache** — tester **uniquement en navigation privée** (Ctrl+Shift+N)
6. **Types dupliqués** : `types/index.ts` (frontend camelCase) vs `types/supabase.ts` (DB snake_case)
7. **13 vulnérabilités npm** (9 moderate, 1 high, 3 critical) — non traitées, à évaluer
