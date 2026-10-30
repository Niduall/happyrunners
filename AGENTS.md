# AGENTS.md - HappyRunners

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
React 19 + TypeScript + Vite + Tailwind v4 + Leaflet + Supabase.

**Voir `ARCHITECTURE.md` pour la cartographie complète** (machine à états, tables, flux, points d'attention).

## Key Commands
```bash
npm run dev        # Dev server (prod, .env)
npm run dev:test   # Dev server sur la base de test (.env.test)
npm run build      # TypeScript check + Vite build
npm run preview    # Preview production build
npm test           # Unit + integration tests (Vitest)
npm test:watch     # Watch mode
npm run lint       # ESLint (TypeScript + règles React hooks)
npm run lint:fix   # ESLint avec corrections automatiques
npm run typecheck  # tsc --noEmit
```

## Workflow obligatoire avant livraison
```bash
npm run lint       # 0 erreur ESLint
npm test           # toute la suite doit passer
npm run build      # 0 erreur TypeScript
# puis : présenter les changements, attendre validation, puis push
```

## Architecture (résumé)
- **SPA**: React 19 + React Router
- **PWA**: vite-plugin-pwa, autoUpdate ; manifeste dans `src/config/pwaManifest.ts` (nom, `lang: fr`, couleur de marque, icônes PNG testées)
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
| `src/hooks/useProfiles.ts` | Annuaire complet (une requête au montage), pour afficher aussi les sans-réponse |
| `src/services/presenceRows.ts` | Fusion annuaire + réponses → lignes du tableau (`status: null` = sans réponse) |
| `src/services/voteTallies.ts` | Décompte unique des votes (présents seulement), partagé par le hook et `getWeekTallies` |
| `src/hooks/useWeather.ts` | Météo mercredi 12h30 |
| `src/services/supabaseService.ts` | API Supabase |
| `src/services/storage.ts` | cache utilisateur local (invalide les ids non entiers) |
| `src/services/gpxParser.ts` | GPX (XML + JSON Strava) |
| `src/services/weatherApi.ts` | Open-Meteo (16 jours, sans clé) |
| `src/services/weatherCode.ts` | Codes WMO → emoji |
| `src/components/Auth.tsx` | `LoginForm` |
| `src/components/UserMenu.tsx` | menu du profil : nom, sécurité (PIN), déconnexion |
| `src/components/ParcoursVoteCard.tsx` | Carte parcours + 1 bouton de vote |
| `src/components/LazyMapView.tsx` | carte Leaflet chargée à la demande — **importer ce composant, pas `MapView`** |
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
- Formats : XML GPX (`trk`, `rte`, `wpt`), JSON Strava `{ "points": [...] }`
- Le XML est lu avec le `DOMParser` natif, **pas** avec `gpxparser` (retiré en
  tâche 13 : il tirait jsdom 15 et cassait le teardown des tests)
- Retourne `{ distance_km, elevation_gain_m, points[] }`
- Le D+ ne cumule qu'entre altitudes connues (une altitude absente vaut
  « inconnue », jamais 0)
- La liste (`getParcours`) ne charge **jamais** `points` (1,1 Mo pour 5
  parcours). Utiliser `useParcoursPoints(id)` (qui appelle
  `getParcoursPoints`) quand la carte est dépliée ; le hook garde le tracé en
  cache tant que le composant reste monté.

### Polling
- `useParcours.ts` : `setInterval(loadParcours, 30000)`
- `useParcoursVotes.ts` : `setInterval(loadAll, 30000)`
- Aucun composant ne doit implémenter sa propre écoute
- `useParcoursVotes` ne refetch `getWeekAttendances` que si la liste des
  présents n'est pas fournie par Home. Après un vote, recharger les votes
  seuls (`loadVotesOnly`), pas les présences.
- Ne pas remplacer une référence inchangée au polling : comparer les données
  avant `setState` (listes, compteurs, choix). Sinon Home se re-rend toutes
  les 30 s pour rien.
- `useProfiles` (annuaire) ne se recharge **pas** en boucle : il ne dépend pas
  de la semaine. Une personne qui s'inscrit apparaît dès qu'elle répond, puis
  avec tout le monde au rechargement suivant.

### Cycle : mercredi 14h → mercredi 14h
- `getCurrentWeekKey()` = date du mercredi cible (`"2026-10-07"`)
- Le run est le mercredi 12h30 ; **à 14h** l'app bascule sur le suivant
- Bascule automatique (pas de cron), y compris si l'app reste ouverte
- `useTargetWednesday()` fournit l'horloge partagée (tick 30 s) : à **consommer**
  dans tout hook qui a besoin de la clé de semaine, sinon le hook fige sa clé au
  montage et affiche le run d'hier
- L'horloge est un **store de module** : un seul `setInterval` pour toute
  l'application, quel que soit le nombre d'appelants. Appeler le hook dans
  chaque composant concerné est donc sans coût ; ne pas réintroduire un
  `setInterval` local ni exiger un montage unique.
- Cache météo lié à la semaine (`weather_cache_<weekKey>`) → invalidé à la bascule
- Toute réponse réseau liée à la semaine (présences, votes, météo) est ignorée
  si une requête plus récente est partie ou si la clé de semaine a changé
  pendant la requête. Une action lancée avant 14h ne réécrit pas l'interface
  de la nouvelle semaine.

### Météo — Open-Meteo
- **Aucune clé API** (contrairement à OpenWeather). Ne pas en réintroduire une.
- 16 jours de prévision, 384 heures horaires, `timezone=Europe/Paris`
- Les heures renvoyées sont **murales Europe/Paris**, sans suffixe : les parser
  avec `isoToEpoch` (deux passes pour l'heure d'été/hiver), jamais avec
  `new Date(iso)` seul. Afficher lever/coucher avec `timeZone: 'Europe/Paris'`.
- Vent **déjà en km/h** : ne pas multiplier par 3.6 (bug OpenWeather)
- `precipitation_probability` est en **pourcent** → normaliser en 0..1
- La probabilité de pluie est **toujours affichée**, même à `0 %` : « pas de
  pluie prévue » est une information. Ne pas remasquer le bloc à zéro.
- Un bandeau **« Autour de 12h30 »** affiche les heures 11h → 14h
  (`getRunWindow`), avec la même tolérance de ±90 min que la sélection du run.
  Ce sont les **heures murales réelles** (`11h`, `12h`…) : ne pas étiqueter
  « 12h30 » une donnée de 12h. Le bandeau disparaît sans prévision du run.
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
- Déverrouillé, le crayon ouvre une modale de **renommage** (nom seul) et
  « Remplacer le GPX » remplace le tracé **sans changer le nom**. Le GPX est
  parsé avant l'écriture : un fichier invalide ne modifie rien.
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

### Accessibilité (tâche 16)
- Toute modale : `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, et fermeture par **Échap** — sauf pendant une écriture en cours.
- Tout champ a un `<label htmlFor>` ; sinon un `aria-label` explicite.
- Les erreurs dynamiques portent `role="alert"` (jamais un simple texte rouge).
- Les en-têtes de tableau ont `scope="col"`.

### Interface — tenue (tâche 20)
- **La date du run n'est écrite qu'une fois** : dans la carte « Tu viens ? »
  (`Mercredi 28 octobre · 12h30 · dans 3 jours`). Ne pas la répéter dans les
  titres de section, les cartes ou le tableau.
- **Refuser une sortie n'est pas une action destructive** : « Pas cette
  semaine » est gris, jamais rouge. Le rouge est réservé aux suppressions et
  aux erreurs.
- **Un seul titre par bloc** : la carte météo n'a pas de titre (celui de la
  section suffit) ; le tableau de présence a un résumé, pas un second titre.
- **Le tableau « Qui vient ? » montre tout le groupe** — présents, absents et
  sans-réponse. Il ne liste jamais seulement ceux qui ont répondu : une
  personne silencieuse doit rester visible, sinon personne ne peut la relancer.
  La fusion vit dans `presenceRows.ts`, pas dans `Home`.
- **« Sans réponse » est un état neutre, pas une alerte** : gris
  (`text-gray-500`, avatars gris), jamais ambre ni rouge. Dix lignes orange
  volaient la vedette au seul présent. Le vert reste réservé à « vient », le
  rouge aux absents et aux actions destructives.
- **Une seule entrée vers la gestion des parcours** : l'icône de l'en-tête.
  Pas de bouton pleine largeur en bas de page.
- **Cibles tactiles ≥ 44 px** (`min-h-11` dans `Button`) et **aucun texte
  inférieur à 12 px**.
- **L'accent `#0077a8`** est le seul bleu portant du texte blanc (contraste
  AA ≈ 5:1). Ne pas revenir à `#009ddc` pour un bouton.

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Oui | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Oui | Supabase anon key (**régénérable** — copier depuis le dashboard si "Invalid API key") |
| ~~`VITE_OPENWEATHER_API_KEY`~~ | **Supprimé** | Open-Meteo n'a pas besoin de clé |

**Base de test** : `.env.test` (non versionné) pointe vers un second projet
Supabase isolé. `npm run dev:test` et `backup.py --env .env.test` l'utilisent.
La prod est réservée aux utilisateurs ; la seule lecture autorisée dessus est
`python3 backup.py save`.

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
- **Un vote exige une présence `going`**. Les triggers
  `participations_require_going` et `attendances_remove_vote*` le garantissent
  en base ; le client ne suffit pas (vote orphelin `#16`).
- **`updated_at` est tenu par la base** : les triggers `trg_parcours_touch`,
  `trg_attendances_touch` et `trg_participations_touch` appellent
  `touch_updated_at()` à chaque `UPDATE`. Ne pas compter sur le client pour
  l'écrire ; `updateParcours` le fait encore par sécurité, sans effet de bord.
- **Un nom = un compte** : index unique `user_profiles_name_key` sur
  `lower(first_name), lower(last_name)`. Une écriture en doublon renvoie
  Postgres `23505`, que `UserMenu` traduit en « Ce nom est déjà utilisé ».
- **Le PIN est optionnel et la casse d'un nom est un choix personnel.** Ne jamais
  forcer un PIN, ni normaliser un nom écrit en majuscules : aucune des deux
  choses n'a d'effet fonctionnel (connexion en `ilike`, tri
  `localeCompare(…, 'fr')`, index sur `lower(...)`).
- La séquence `user_number` est irremplaçable. La perdre casse la création.
- `profiles` et `responses` sont des tables **mortes** (ancien identifiant
  dérivé du nom). `schema.sql` les supprime ; ne pas les recréer.

### Migrations
`schema.sql` décrit l'**état cible** d'une base vide. `migrations/` contient les
scripts datés qui font évoluer une base **existante** :

```bash
# 1. base de test d'abord, 2. prod après validation explicite
# (SQL Editor du dashboard Supabase, ou psql avec la chaîne de connexion)
```

Règles : un fichier par tâche, **rejouable** (`IF NOT EXISTS`, `OR REPLACE`,
`DROP ... IF EXISTS`), **jamais de perte de données** (pas de `DELETE` /
`TRUNCATE` / `DROP TABLE`), et il doit reprendre exactement ce que `schema.sql`
décrit. `src/services/schema.test.ts` vérifie que les deux ne divergent pas.

### Sauvegarde
```bash
python3 backup.py save                  # exporte la prod (hors dépôt)
python3 backup.py list                  # backups disponibles
python3 backup.py restore <fichier>     # ⚠️ remplace le contenu des tables
python3 backup.py restore <fichier> --dry-run
python3 backup.py save --env .env.test  # cible la base de test
```

`save` pagine par 1 000 lignes. `restore` valide le fichier, sauvegarde l'état
courant, supprime dans l'ordre inverse et vérifie les comptes. Il refuse aussi
un dump contenant un vote sans présence `going` (ancien vote orphelin), avant
toute suppression. Il sort en **code 2** tant que le `setval` de
`user_number_seq` n'a pas été exécuté.
Tests hors ligne : `python3 -m unittest test_backup.py -v`.

## Testing
```bash
npm test
```
Toute la suite doit passer. **Ne jamais figer un nombre de tests dans ce
document** : le chiffre devient faux au prochain test ajouté. Cette section a
déjà annoncé « 30 tests doivent passer » pendant des mois.

Fichiers à connaître (liste **non exhaustive** — `ls src/**/*.test.*` pour le reste) :

| Fichier | Couvre |
|---------|--------|
| `src/services/weekKey.test.ts` | bascule 14h, passage d'année, bissextile |
| `src/services/weatherApi.test.ts` | parsing Open-Meteo, couverture 16 j |
| `src/services/weatherCode.test.ts` | mapping des 28 codes WMO, jour/nuit |
| `src/services/pin.test.ts` | `hashPin` |
| `src/hooks/useAuth.integration.test.tsx` | flux auth complet + partage d'état |
| `src/hooks/useParcoursVotes.test.tsx` | votes hebdo, tri, pendingCount, optimisme |
| `src/hooks/useParcoursVotes.attendance.test.tsx` | un vote sans présence ne compte pas |
| `src/services/adminCode.test.ts` | verrou admin, ne mémorise rien |
| `src/pages/ParcoursList.admin.test.tsx` | portée du déverrouillage (page + personne) |
| `src/services/schema.test.ts` | `schema.sql` rejouable et à jour |
| `src/services/storage.test.ts` | cache utilisateur local |
| `src/services/gpxParser.test.ts` | XML/JSON GPX, distance, dénivelé, simplification, bounds |
| `src/test/setup.ts` | mock Supabase global + cleanup |

Ajouter un test pour toute nouvelle logique d'auth ou d'identification.

## Deployment
- GitHub : `Niduall/happyrunners` (branche `main`)
- Vercel auto-deploy au push sur `main` → **nécessite validation utilisateur avant push**
- CI GitHub Actions (`.github/workflows/ci.yml`) : `npm ci` + lint + tests + build
  sur chaque push `main` et PR. Vercel ne lance que `npm run build` : ne pas
  pousser sur un run rouge.
- Env vars : Vercel Dashboard → Settings → Environment Variables

## Common Pitfalls to Avoid
1. **⛔ Ne jamais `git push` sans accord explicite de l'utilisateur**
2. **Ne pas dupliquer la logique de vote** — un seul `useParcoursVotes`, et un seul décompte (`voteTallies.ts`)
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
7e. **Double garde sur les réponses asynchrones** — identifiant de requête + clé
    de semaine pour tout hook lié à la semaine ; une réponse obsolète n'écrit ni
    état ni cache. La météo est vidée au changement de `cacheKey` pour laisser
    voir l'erreur du nouveau fetch.
7f. **Heures météo en Europe/Paris** — `isoToEpoch` interprète les dates
    Open-Meteo dans ce fuseau, pas dans celui du navigateur ; lever/coucher
    affichés avec `timeZone: WEATHER_TIMEZONE`.
7g. **Importer `LazyMapView`, jamais `MapView` en direct** — un import statique
    ramène Leaflet (~43 kB gzip) dans le bundle principal et au démarrage.
7h. **Un changement de présence ne relance pas un chargement complet** —
    `useParcoursVotes` recalcule depuis `votesRef`, puis rafraîchit les votes
    seuls en silence. Un refetch complet = écran vidé, `loading`, et deux
    requêtes pour rien.
8. **`npm run lint` + `npm test` + `npm run build` obligatoires** avant de présenter un changement

## Known Issues
- Vulnérabilités npm : 4 restantes, toutes `low`, dans l'outillage de build
  (`workbox-build` → `deepmerge`) — jamais servies aux utilisateurs, aucun
  correctif amont disponible ; `npm audit` pour le détail
- Bundle au-dessus de 500 kB — warning Vite, pas bloquant — `npm run build` pour la taille exacte
- Sécurité du PIN faible par conception (hash client simple, pas d'auth serveur) — acceptable pour un club de collègues, **pas** pour un usage réel
