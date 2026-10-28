# CARTOGRAPHIE.md — HappyRunners

> But de ce document : permettre à quelqu'un qui n'a pas écrit le code (ou à
> toi dans six mois) de savoir **où vit chaque chose**, **où sont les pièges**,
> et **quoi vérifier** avant de toucher à un fichier.
>
> Il ne remplace pas `ARCHITECTURE.md` (machine à états, tables, flux) ni
> `AGENTS.md` (règles de travail). Il les complète par un inventaire exhaustif
> et une liste de dette classée par gravité.
>
> **Chaque affirmation porte une référence `fichier:ligne`.** Ce qui n'a pas pu
> être vérifié est marqué « à confirmer ». Dernière passe : 19 octobre 2026,
> commit `0c554e1`.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Cartographie des fichiers](#2-cartographie-des-fichiers)
3. [Où vit chaque règle métier](#3-où-vit-chaque-règle-métier)
4. [Flux principaux](#4-flux-principaux)
5. [Dette classée par gravité](#5-dette-classée-par-gravité)
6. [Ce qui n'est pas dans le dépôt](#6-ce-qui-nest-pas-dans-le-dépôt)
7. [Checklist après un changement](#7-checklist-après-un-changement)
8. [Plan de correction](#8-plan-de-correction)

---

## 1. Vue d'ensemble

### Stack réelle (mesurée, pas déclarée)

| Élément | Version réellement installée | Déclarée dans `package.json` |
|---|---|---|
| React | **19.3.0** | `^19.3.0` ✅ |
| react-dom | **19.3.0** | `^19.3.0` ✅ |
| TypeScript | 6.0.3 | `~6.0.2` |
| Vite | 5.4.0 | `^5.4.0` |
| Tailwind | 4.3.3 | `^4.3.3` |

**Corrigé (tâche 1).** `react` et `react-dom` étaient importés partout mais
absents de `package.json` : ils n'arrivaient que par les *peer dependencies*
(`lucide-react`, `react-router-dom`, `@testing-library/react`), ce qui rendait
une installation fraîche dépendante d'une résolution transitive. Ils sont
désormais déclarés en `^19.3.0`, et les trois documents qui annonçaient
« React 18 » (`README.md:17`, `ARCHITECTURE.md:5`, `AGENTS.md:21,42`) disent
maintenant React 19.

### Le cycle hebdomadaire

Une seule règle, source unique : `src/services/weekKey.ts:34-76`.
Bascule le **mercredi à 14h** (le run est à 12h30), sans cron : c'est l'horloge
locale qui décide. Clé de semaine = date du mercredi cible, `YYYY-MM-DD`.

### Les quatre tables

`schema.sql` est la source de vérité. RLS activée mais **entièrement ouverte**
(`USING (true)` sur les 4 tables, `schema.sql:161-194`) : l'identité est côté
client, c'est une dissuasion, pas une sécurité. Quatre tables vivantes plus
deux tables mortes supprimées à la fin du fichier (`schema.sql:202-203`).

| Table | Clé | Contrainte structurante |
|---|---|---|
| `user_profiles` | `user_number` (séquence) | identifiant stable, indépendant du nom |
| `parcours` | `id` uuid | `points` jsonb = tracé GPX |
| `attendances` | `UNIQUE(week_key, user_number)` | `going` \| `skip` |
| `participations` | `UNIQUE(user_number, week_key)` | un seul parcours par personne et par semaine |

### Le tracé des données

```
                 ┌──────────────────────────────────────────┐
   Home.tsx ────▶ │ useAttendance  (30 s)  ──▶ attendances   │
     │           │ useParcoursVotes(30 s) ──▶ participations│──▶ Supabase
     │           │ useParcours    (30 s)  ──▶ parcours      │
     │           │ useWeather     (30 min)──▶ Open-Meteo   │
     │           │ useTargetWednesday (30 s, sans réseau)   │
     │           └──────────────────────────────────────────┘
     └──▶ composants (AttendanceBanner, ParcoursVoteCard,
          ParticipantsTable, WeatherCard)
```

`localStorage` ne sert plus que de **secours** pour l'utilisateur
(`running_user`) et de cache météo par semaine (`weather_cache_<weekKey>`).
Supabase gagne toujours quand il répond.

---

## 2. Cartographie des fichiers

Toutes les lignes sont sous `running-app/`.

### 2.1 Entrée et routage

| Fichier | Responsabilité | Lignes |
|---|---|---|
| `src/main.tsx` | point d'entrée **réel** : monte `App` sous `StrictMode` + `AuthProvider` | 12 |
| `src/App.tsx` | routeur : `/` → `Home`, `/parcours` → `ParcoursList` | 17 |
| `index.html` | hôte, `lang="fr"`, monte `#root` | 19 |

### 2.2 Pages

| Fichier | Responsabilité | Lignes |
|---|---|---|
| `src/pages/Home.tsx` | page principale : auth, présence, météo, vote, tableau des participants | 360 |
| `src/pages/ParcoursList.tsx` | gestion : liste, import GPX, suppression, verrou admin | 316 |

### 2.3 Composants métier

| Fichier | Responsabilité | Lignes |
|---|---|---|
| `src/components/Auth.tsx` | identité / création de compte / saisie PIN | 413 |
| `src/components/SecurityModal.tsx` | gestion du PIN : ajouter, changer, retirer | 258 |
| `src/components/ParcoursCard.tsx` | carte parcours en mode gestion (import GPX, actions admin) | 170 |
| `src/components/ParticipantsTable.tsx` | tableau présence + parcours choisi, tri, avatars | 163 |
| `src/components/UserMenu.tsx` | menu utilisateur : nom, édition, Sécurité, déconnexion | 161 |
| `src/components/WeatherCard.tsx` | météo, deux mises en page (compacte / complète) | 146 |
| `src/components/MapView.tsx` | carte Leaflet : polyligne + marqueurs départ/arrivée | 123 |
| `src/components/LazyMapView.tsx` | carte chargée à la demande (`lazy` + `Suspense`), fallback à la même hauteur | 39 |
| `src/components/AdminCodeModal.tsx` | saisie du code administrateur | 110 |
| `src/components/ParcoursVoteCard.tsx` | carte parcours en mode vote (1 bouton, compteur, badge vainqueur) | 103 |
| `src/components/ConfirmDeleteModal.tsx` | confirmation de suppression + annonce des votes perdus | 97 |
| `src/components/AttendanceBanner.tsx` | encadré « Tu viens ? » + deux boutons de présence | 70 |

### 2.4 Composants génériques

| Fichier | Responsabilité | Lignes |
|---|---|---|
| `src/components/ui/Button.tsx` | bouton : variantes, tailles, spinner | 48 |
| `src/components/ui/Card.tsx` | conteneurs de carte | 34 |
| `src/components/ui/Input.tsx` | champ texte stylé | 20 |

### 2.5 Hooks

| Fichier | Responsabilité | Lignes |
|---|---|---|
| `src/hooks/useAuth.tsx` | Context d'authentification : identité par nom, PIN, profil, cache | 355 |
| `src/hooks/useParcoursVotes.ts` | votes + présences, filtre des votants, compteurs, vainqueurs | 268 |
| `src/hooks/useAttendance.ts` | présence hebdo, polling 30 s, état optimiste | 155 |
| `src/hooks/useWeather.ts` | météo, cache par semaine, rafraîchissement 30 min | 149 |
| `src/hooks/useParcours.ts` | CRUD parcours, parsing GPX, polling 30 s | 80 |
| `src/hooks/useTargetWednesday.ts` | horloge de semaine cible (tick 30 s, sans réseau) | 56 |

### 2.6 Services

| Fichier | Responsabilité | Lignes |
|---|---|---|
| `src/services/supabaseService.ts` | toutes les requêtes Supabase | 306 |
| `src/services/gpxParser.ts` | parse GPX XML (DOMParser natif) et JSON Strava, distance, dénivelé, simplification | 265 |
| `src/services/weatherApi.ts` | client Open-Meteo + sélection de la prévision du mercredi 12h30 | 343 |
| `src/services/storage.ts` | cache localStorage de l'utilisateur (id entier uniquement) | 46 |
| `src/services/weekKey.ts` | règle du cycle hebdomadaire et formatage | 87 |
| `src/services/weatherCode.ts` | codes WMO → emoji / libellé / classes Tailwind | 85 |
| `src/services/adminCode.ts` | lecture et comparaison du code admin, sans mémorisation | 50 |
| `src/services/pin.ts` | obfuscation du PIN 4 chiffres | 19 |

### 2.7 Types et utilitaires

| Fichier | Responsabilité | Lignes |
|---|---|---|
| `src/types/supabase.ts` | types des lignes DB en snake_case — **source unique** de `GPXPoint` et `ProfileIdentity` | 118 |
| `src/types/index.ts` | types applicatifs (`User`, `UserIdentity`) + ré-exports DB | 60 |
| `src/lib/supabase.ts` | instancie le client Supabase | 15 |
| `src/lib/utils.ts` | `cn()` = `clsx`, **sans fusion Tailwind** | 4 |
| `src/test/setup.ts` | mock global Vitest + nettoyage | 61 |

### 2.8 Tests

34 fichiers, 440 tests, ~30 s.

| Fichier | Couvre |
|---|---|
| `src/hooks/useAuth.integration.test.tsx` | flux auth complet + partage d'état (602 l.) |
| `src/components/Auth.test.tsx` | écrans d'identité et de PIN (516 l.) |
| `src/hooks/useParcoursVotes.test.tsx` | votes hebdo, tri, pendingCount, optimisme |
| `src/hooks/useParcoursVotes.attendance.test.tsx` | un vote sans présence ne compte pas |
| `src/pages/ParcoursList.admin.test.tsx` | portée du déverrouillage (page + personne) |
| `src/pages/ParcoursList.test.tsx` | suppression, confirmation |
| `src/services/weatherApi.test.ts` | parsing Open-Meteo, couverture 16 j |
| `src/services/weekKey.test.ts` | bascule 14h, année, bissextile |
| `src/services/supabaseService.test.ts` | requêtes et mapping |
| `src/services/schema.test.ts` | `schema.sql` rejouable et à jour |
| `src/components/SecurityModal.test.tsx` | gestion du PIN |
| `src/hooks/useParcours.test.tsx` | CRUD parcours |
| `src/hooks/useWeather.test.tsx` | cache et rafraîchissement |
| `src/hooks/useAttendance.test.tsx` | présence hebdo |
| `src/services/storage.test.ts` | cache utilisateur local |
| `src/services/gpxParser.test.ts` | parser GPX XML/JSON, distance, dénivelé, simplification, bounds |
| `src/services/weatherCode.test.ts` | mapping des 28 codes WMO |
| `src/services/adminCode.test.ts` | verrou admin, ne mémorise rien |
| `src/hooks/useTargetWednesday.test.ts` | horloge de semaine |
| `src/components/AttendanceBanner.test.tsx` | aucun bouton rempli sans réponse |
| `src/components/ParcoursVoteCard.test.tsx` | bouton de vote |
| `src/components/LazyMapView.test.tsx` | fallback puis carte, hauteur par défaut |
| `src/components/ParticipantsTable.test.ts` | tri des lignes |
| `src/services/pin.test.ts` | `hashPin` |
| `src/pages/Home.weather.test.tsx` | météo sur la page d'accueil |

Le parser GPX (`gpxParser.ts`, 265 lignes) est couvert par
`gpxParser.test.ts` : XML (trace, route, waypoints), JSON Strava, entrées
vides/invalides, conversion des coordonnées, distance, dénivelé (dont A8),
`simplifyPoints` et `getBounds`. Le XML est lu avec le `DOMParser` natif :
`gpxparser` (et son jsdom 15) a été retiré en tâche 13.

### 2.9 Base de données et scripts

| Fichier | Responsabilité | Lignes |
|---|---|---|
| `schema.sql` | structure complète, rejouable : tables, index, RLS, purge des tables mortes | 202 |
| `backup.py` | `save` / `list` / `restore` de la prod, via l'API REST | 449 |
| `public/` | `favicon.svg`, 4 PNG (192, 512, maskable 512, Apple 180) aux bonnes dimensions | — |

### 2.10 Configuration

| Fichier | Responsabilité | À savoir |
|---|---|---|
| `vite.config.ts` | build + PWA + config Vitest | le manifeste vient de `src/config/pwaManifest.ts` (testé) ; `includeAssets` cite `favicon.svg` et l'icône Apple |
| `tsconfig.json` | TypeScript | `strict` activé (tâche 12) ; `noUnusedLocals` et `noUnusedParameters` aussi |
| `.github/workflows/ci.yml` | CI GitHub Actions | `npm ci` + lint + tests + build sur push `main` et PR (tâche 24) |
| `postcss.config.js` | `@tailwindcss/postcss` + autoprefixer | `autoprefixer` est redondant avec v4, sans effet |
| `.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_CODE` | non versionné ✅ |

#### Le manifeste PWA correspond à l'application — corrigé (tâche 15)

| Réglage | Valeur servie | Réalité de l'app |
|---|---|---|
| `name` / `short_name` | `HappyRunners` / `HappyRunners` | conforme à l'interface |
| `lang` | `fr` (explicite) | conforme |
| `theme_color` | `#593A5A` | couleur de marque (`src/index.css:4`) |
| icônes | PNG 192, 512 et maskable 512, plus Apple 180 | vrais PNG, dessin dans la zone sûre maskable |
| `includeAssets` | `favicon.svg`, `apple-touch-icon.png` | présents dans `public/` |

---

## 3. Où vit chaque règle métier

Table de référence pour éviter de corriger une règle à un seul endroit.

| Règle | Où elle vit | État |
|---|---|---|
| Cycle mercredi 14h → mercredi 14h | `src/services/weekKey.ts:34-76` | ✅ source unique |
| Libellé de semaine | `weekKey.formatWeekLabel` | ✅ unique (réexporté par `useTargetWednesday.ts:56`) |
| Identité = `user_number`, jamais le nom | `user_profiles` + `schema.sql:24-41` | ✅ |
| Un seul parcours par personne et par semaine | `schema.sql:110` + `onConflict` `supabaseService.ts:288` | ✅ tenu par la base |
| Un seul choix de présence par semaine | `schema.sql:81` | ✅ tenu par la base |
| **Un vote ne compte que si la personne vient** | `useParcoursVotes.ts:91-113` (client) | ⚠️ **pas en base**, et **contredit** par `getWeekTallies` (§5.C1) |
| « Pas aujourd'hui » retire aussi le choix de parcours | `useAttendance` (suppression du vote) | ✅ client |
| Statuts de présence `going`/`skip` | `types/supabase.ts:52` + `schema.sql:75` | ✅ |
| Statut de vote `yes`/`no` | écrit en clair à 5 endroits (`types/supabase.ts:47,57`, `supabaseService.ts:219,241,281`) | ⚠️ pas de type partagé ; `'no'` n'est **jamais écrit** par l'app |
| Code admin | `src/services/adminCode.ts` + `VITE_ADMIN_CODE` | ✅ mais présent **en clair** dans le bundle (§6) |
| Verrou admin = une page, une personne | `ParcoursList.tsx` (`useState`) | ✅ et verrouillé par 11 tests |
| PIN 4 chiffres | `src/services/pin.ts` + `user_profiles.pin_hash` | ⚠️ obfuscation, pas un vrai hash |
| Météo = prochaine sortie, 12h30, avec les heures 11h → 14h | `weatherApi.ts` (`getRunForecast`, `getRunWindow`) | ✅ |

---

## 4. Flux principaux

### 4.1 Ouverture de l'app

```
main.tsx → AuthProvider
  ├─ localStorage vide ─────────────────▶ first_login  → LoginForm
  ├─ cache présent → getUserProfile() ──▶ pin_hash ? → pin_verification
  │                                   └─ pas de PIN  → authenticated
  └─ erreur réseau ─────────────────────▶ authenticated avec le **cache**
```

Points d'attention : la purge du cache n'a lieu que sur l'erreur `22P02`
(`useAuth.tsx:121-124`) ; si `getUserProfile` renvoie `null`, le cache n'est pas
vidé (`useAuth.tsx:98-102`).

### 4.2 Home — ce qui se charge en parallèle

| Hook | Requête | Fréquence |
|---|---|---|
| `useParcours` | `parcours?select=*` | 30 s |
| `useAttendance` | `attendances` puis `user_profiles` | 30 s |
| `useParcoursVotes` | `participations` + `attendances` (résultat jeté) + `user_profiles` | 30 s |
| `useWeather` | Open-Meteo | 30 min |

Mesuré sur `happyrunners.vercel.app` en ~70 s : **3 appels à `attendances` et
3 à `user_profiles`** pour ce court laps de temps, alors que le résultat de l'un
des deux appels à `getWeekAttendances` est jeté
(`useParcoursVotes.ts:74-77` puis `:91-96`) : la signature des présents est déjà
connue d'`useAttendance`.

### 4.3 Vote

```
clic « Je viens » ─▶ useAttendance.setMyStatus
                      ├─ setAttendance(going)      (upsert)
                      └─ deleteWeekVote()          (si « pas aujourd'hui »)
                   ─▶ rechargement des présences ─▶ Home recalcule goingUserNumbers
                   ─▶ useParcoursVotes refetch votes + présences
```

### 4.4 Gestion des parcours

`/parcours` → `ParcoursList`, verrou admin en état local. Le déverrouillage
meurt au démontage **et** au changement d'utilisateur (`AGENTS.md`, 11 tests).
L'import GPX reste ouvert à tous.

Une fois déverrouillé, le crayon ouvre `ParcoursRenameModal` (nom seul) et le
bouton « Remplacer le GPX » de chaque carte remplace le tracé sans toucher au
nom (`editParcours` dans `useParcours`, `updateParcours` dans le service).

---

## 5. Dette classée par gravité

### A. Bugs à corriger

**A1 (corrigé, tâche 5). Une panne de chargement des présences efface tous les votes.**
`Home.tsx:70` passe toujours `goingUserNumbers`. Si `useAttendance` a échoué,
`attendees` est vide (`useAttendance.ts:47-56`), la liste vide fait autorité et
`useParcoursVotes.ts:91-113` filtre **tous** les votes. L'écran affiche zéro
vote alors que la requête de votes a réussi.
Correction : Home passe `undefined` tant que les présences ne sont pas
disponibles ; le hook charge votes et présences indépendamment et, si les
présences échouent, compte tous les votes (`going = null`) au lieu de zéro.

**A2 (corrigé, tâche 5). Totaux divergents entre les deux écrans (vérifié).**
`getWeekTallies` (`supabaseService.ts:242-255`) compte **tous** les votes, sans
filtrer les présents. `ParcoursList.tsx:138` l'utilise pour afficher les
compteurs, tandis que Home passe par le recomptage filtré de
`useParcoursVotes.ts:98-107`. Le vote orphelin `#16` (semaine `2026-10-14`,
confirmé en base) illustrerait la divergence : 1 sur la page de gestion, 0 sur
Home. Latent aujourd'hui (ces compteurs ne portent que sur la semaine en cours,
où il n'y a aucun vote), faux dès qu'un vote sans présence tombe dans la
semaine courante.
Correction : `getWeekTallies` filtre par les présents et délègue à
`summarizeVotes`, la même fonction que Home. Le vote orphelin `#16` n'est plus
compté nulle part (il reste en base, intact).

**A3. Rien n'empêche en base un vote sans présence.** *(corrigé — tâche 6)*
Aucune contrainte ni trigger ne liait `participations` à
`attendances.status = 'going'` (`schema.sql`). La règle était purement client —
c'est exactement ce qui a produit le vote orphelin `#16`. Désormais
`participations_require_going` refuse un vote sans présence `going` (avec
`FOR SHARE`), et `attendances_remove_vote_when_not_going` /
`attendances_remove_vote_on_delete` retirent le vote quand la présence passe à
`skip` ou disparaît.

**A4 (corrigé, tâche 8). Réponses obsolètes autour de la bascule du mercredi
14h.** Aucun hook de données ne vérifiait que la réponse concernait toujours la
semaine demandée : `useAttendance.ts`, `useParcoursVotes.ts`, `useParcours.ts`,
`useWeather.ts`. Une requête pour l'ancienne semaine qui résout après la
nouvelle écrasait l'affichage.

Correction : chaque chargement porte un identifiant de requête et, pour les
hooks liés à la semaine, la clé demandée. La réponse (succès, erreur ou
`finally`) est ignorée si une requête plus récente est partie ou si la semaine
a changé. Les actions (`setMyStatus`, `toggleChoice`) capturent leur semaine et
ne réécrivent plus l'interface ni ne relancent un chargement après la bascule.
`useParcours` n'a que l'identifiant de requête (pas de semaine). Côté météo,
une réponse tardive ne peut ni écrire son cache ni purger celui de la nouvelle
semaine ; l'ancienne météo est vidée au changement de cache pour que l'erreur
du nouveau chargement soit visible. Tests : `src/hooks/staleResponses.test.tsx`.

**A5 (corrigé, tâche 9). Météo décalée hors du fuseau Europe/Paris.**
`isoToEpoch` interprétait les heures Open-Meteo dans le fuseau **du
navigateur**, alors que la requête demande `timezone=Europe/Paris`. Le
commentaire affirmait que c'était voulu : c'est faux hors de France.

Correction : `isoToEpoch` interprète désormais les dates ISO comme des heures
murales de `Europe/Paris` (deux passes pour l'heure d'été/hiver), y compris les
dates seules des prévisions quotidiennes (minuit à Paris). `getRunTimestamp` et
`startOfDay` utilisent le même fuseau, donc la sélection du créneau de 12h30 et
du lever/coucher du jour du run ne dépend plus du navigateur. `WeatherCard`
affiche lever/coucher avec `timeZone: Europe/Paris`. Tests :
`weatherApi.test.ts` (timestamps UTC fixes, indépendants du fuseau de la
machine) et `WeatherCard.timezone.test.tsx` (navigateur en `America/New_York`).
La clé de semaine (`weekKey.ts`) reste calculée dans le fuseau du navigateur :
c'est un point distinct, déjà signalé.

**A6 (corrigé, tâche 7). Erreur partiellement fausse sur la présence.** Si
`setAttendance` réussit mais `deleteWeekVote` échoue (`useAttendance.ts:110-122`),
l'UI revient en arrière et affiche une erreur alors que la présence **est**
enregistrée. Le rechargement suivant corrige l'affichage, pas la confusion.

Correction : la suppression du vote est un **filet de sécurité best-effort**.
Si `setAttendance` réussit et que `deleteWeekVote` échoue, la présence reste
affichée, aucune erreur n'est montrée et l'échec est seulement journalisé
(`console.warn`). Le trigger DB garantit de toute façon qu'un vote sans présence
`going` ne compte pas.

**A7 (corrigé, tâche 7). Les noms des participants peuvent disparaître en silence.**
`getWeekAttendances` ignore l'erreur de la seconde requête (`:167-170`) et
renvoie des noms vides (`:179-184`), sans remonter d'erreur.

Correction : l'erreur de la requête `user_profiles` est journalisée et les
noms manquants deviennent `Membre #N`. Les présences restent affichées ; la
panne est visible au lieu d'être silencieuse.

**A8. Dénivelé faussé si une altitude manque. — corrigé (tâche 13).**
L'ancien calcul partait de `ele ?? 0` : une altitude absente (surtout au premier
point) était comptée comme 0 et inventait une montée. Le D+ ne cumule plus
désormais qu'entre deux altitudes connues ; test de non-régression dans
`gpxParser.test.ts` (« ne compte pas une altitude manquante comme 0 »).

**A9. `updated_at` n'est jamais écrit. — corrigé (tâche 17).** Le trigger
`touch_updated_at` est actif sur `parcours`, `attendances` et `participations`
(`schema.sql`) : tout `UPDATE` remet la colonne à `now()`, y compris les upserts
de présence et de vote qui l'ignoraient. `updateParcours` continue de l'écrire
explicitement — le trigger l'écrase avec la même valeur, et l'application reste
correcte tant que la migration n'est pas passée sur une base.

**A10. Pas d'unicité sur le nom. — corrigé (tâche 17).** L'index unique
`user_profiles_name_key` porte sur `lower(first_name), lower(last_name)`, ce qui
correspond au `ilike` de `findProfileByName`. Un renommage vers un nom déjà pris
affiche « Ce nom est déjà utilisé par un autre profil » au lieu d'une erreur
générique. La migration (`migrations/2026-10-25_tache17.sql`) refuse de
s'appliquer si des doublons existent déjà : elle ne fusionne aucun compte
elle-même.

**A11 (corrigé, tâche 2). `fix_uuid.sql` détruisait `created_by`.** `created_by` est un `integer`
(`schema.sql:58`), mais le script fait
`WHERE created_by::text NOT LIKE '________-____-____-____-____________'` :
pour un entier comme `3`, la condition est vraie, donc **toutes** les lignes
seraient mises à `NULL`. Le fichier n'était référencé nulle part : **supprimé**.

### B. Propreté des données (constaté en base le 19/10/2026)

| Constat | Détail |
|---|---|
| 11 membres, 10 avec PIN | `#14 Julie Moudin` n'a pas de PIN — **choix assumé (tâche 18)** : le PIN est optionnel par conception, chacun décide d'en mettre un. Ne pas en forcer un. |
| 1 vote orphelin | `#16 Cinthia Marquant`, semaine `2026-10-14`, aucune présence |
| Casse inhabituelle | `#13 HOUTMANN`, `#15 ZILLIOX` — **casse volontaire (tâche 18)** : aucun effet fonctionnel (connexion en `ilike`, tri `localeCompare(…, 'fr')`, index sur `lower(...)`). Ne pas normaliser. |
| Trou dans la séquence | `user_number` : 3 puis 8 → 17 (4, 5, 6, 7 absents) |
| 5 parcours créés le même jour | tous le `2026-10-06` |
| Tracés | les 5 ont leurs points (1 932 à 3 174 par parcours) |

### C. Incohérences de logique

**C1 (corrigé, tâche 5).** Deux algorithmes de comptage non équivalents (voir A2), aucune fonction
partagée.
Correction : un seul module, `src/services/voteTallies.ts` (`goingSet` +
`summarizeVotes`), utilisé par le hook et par le service.

**C2 (corrigé, tâche 7).** `verifyUserPin`, `setPin`, `clearPin`, `profileExists` renvoient `false`
aussi bien pour un refus métier que pour une panne réseau
(`useAuth.tsx:188-191,212-215,268-271,288-291`) : l'interface ne peut pas
distinguer les deux.

Correction : contrat documenté et appliqué — `false` = refus métier, une panne
**lève**. `Auth` et `SecurityModal` affichent un message distinct
(« Impossible de… ») et conservent la saisie ; `profileExists` ne propose plus
une création de profil sur une simple panne.

**C3. — corrigé (tâche 26).** Un seul mot pour le statut de présence :
`PresenceRow.attendance` est devenu `PresenceRow.status`, comme
`Attendee.status` et la colonne `attendances.status`. Le seul écart restant est
assumé et documenté : `User.id` contient un `user_number` ; le renommer
casserait les sessions déjà enregistrées en `localStorage`.

**C4. — corrigé (tâche 25).** Les conversions snake_case ↔ camelCase étaient
réécrites à la main à plusieurs endroits. Désormais : `GPXPoint` n'a **qu'une
définition** (`types/supabase.ts`, ré-exportée par `types/index.ts`) ;
`ProfileIdentity` (`Pick<UserProfile, …>`) remplace les trois formes inline ;
`UserIdentity` (camelCase) sert de base à `PendingUser`, et `identityOf()`
centralise la conversion profil → identité dans `useAuth.tsx`.

**C5.** `useTargetWednesday` instancié **cinq fois** (`Home.tsx:33`,
`useAttendance.ts:41`, `useParcoursVotes.ts:61`, `useWeather.ts:28`,
`ParcoursList.tsx:20`), donc cinq `setInterval` — alors que son propre
commentaire (`useTargetWednesday.ts:8-11`) demande de le monter une seule fois.
**Corrigé (tâche 21)** : l'horloge est un store de module, un seul timer pour
tous les abonnés, libéré quand plus personne n'écoute.

**C6. — corrigé (tâche 23).** `useParcoursVotes` relançait un chargement réseau
complet à chaque changement de la liste des présents : l'effet de montage
dépendait de `goingList`, donc chaque réponse de présence vidait les compteurs,
repassait par `loading` et refaisait `getWeekVotes` + `getWeekAttendances`.
Les votes bruts sont désormais conservés (`votesRef`) et `summarizeVotes` est
réappliqué localement quand les présents changent : compteur à jour
immédiatement, sans état vide. Un rafraîchissement **silencieux** des votes
seuls suit ce changement (une requête, jamais les présences, pas de `loading`)
pour récupérer un vote déposé dans la foulée. `fetchVotes` relit la liste au
moment de la réponse (`goingListRef`) : une requête en vol reste filtrée par la
présence la plus récente. Tests : `useParcoursVotes.test.tsx` (compteur
immédiat, rafraîchissement silencieux, pas de double chargement au démarrage)
et `staleResponses.test.tsx` (présence changée pendant la requête).

### D. Performance

**D1. `getParcours` rapatrie 1,1 Mo de coordonnées à chaque cycle. — corrigé.**
Mesuré : `parcours?select=*` = **1 135 kB brut / 131 kB gzip**, contre **830
octets** sans la colonne `points`. Les points ne servent qu'à `MapView`
(`ParcoursCard.tsx`) — donc à la carte dépliée, pas à la liste.

Correction : `getParcours` ne sélectionne plus que les colonnes de résumé
(`ParcoursSummary`, sans `points`) ; `getParcoursPoints(id)` charge le tracé
d'un seul parcours au premier dépliage de la carte. Le composant garde les
points en mémoire tant qu'il est monté, avec états de chargement, d'erreur et
de tracé absent. Le même chargement est réutilisé dans `ParcoursVoteCard`
(tâche 10b), où une seule carte peut être ouverte à la fois.

**D2. `getWeekAttendances` appelé deux fois par cycle, un résultat jeté. — corrigé.**
`useParcoursVotes` ne charge les présences que si `goingUserNumbers` est
`undefined` (repli). Quand Home fournit la liste des présents, le cycle ne
fait plus qu'une requête de présences, celle de `useAttendance`.

**D3. Rechargements trop larges après une action. — corrigé.**
Après un vote, `toggleChoice` appelle `loadVotesOnly` : une requête
`getWeekVotes`, pas `getWeekAttendances`, en réutilisant la dernière liste de
présents connue. Dans `setAttendance`, la présence et la suppression du vote
sont lancées dans le même `Promise.allSettled` ; la présence reste la source
de vérité et le retrait du vote reste best-effort.

**D4. Nouvelle référence d'objet à chaque polling**, donc re-rendu de Home
toutes les 30 s même quand rien ne change. — corrigé.
Les hooks comparent les données avant de remplacer l'état (`sameAttendees`,
`sameParcoursList`/`sameParcours`, `sameTallies`/`sameChoices`). Un polling
sans changement ne remplace plus les références et ne re-rend plus Home.

**D5. Bundle et logs. — partiellement corrigé (tâche 13).**
27 `console.*` de debug (dont le contenu GPX sur 500 caractères) et 3 logs de
test ont été retirés ; il reste 34 `console.*`, uniquement des erreurs/warns
utiles, sans contenu utilisateur. Les 5 `any` du parser GPX et d'Open-Meteo
sont typés. `gpxparser` a été remplacé par le `DOMParser` natif : le bundle JS
passe de 761,5 à 752,0 kB (gzip 219,5 → 217,0 kB) et les vulnérabilités npm de
17 à 8.

**D6. Index redondant. — corrigé (tâche 17).** `idx_attendances_week` a été
supprimé : le préfixe de l'index unique `(week_key, user_number)` couvre les
mêmes lectures. L'index qui manquait sur les noms est désormais
`user_profiles_name_key` (voir A10).

**D7. Aucun découpage du bundle. — corrigé (tâche 22).** Leaflet n'est plus
embarqué dans le bundle principal : `LazyMapView` l'importe dynamiquement, donc
le module part dans un chunk séparé, chargé au premier affichage de carte
(précaché ensuite par le service worker). Mesuré : **755,60 → 604,89 kB**
(gzip **218,17 → 173,61 kB**) au premier chargement, Leaflet pesant à lui seul
149,76 kB (gzip 43,41 kB). Le bundle principal reste au-dessus de 500 kB
(warning Vite, non bloquant) ; le parseur GPX reste dans le principal.

### E. Code mort et fichiers orphelins

| Élément | Référence | Note |
|---|---|---|
| `src/main.ts`, `src/counter.ts`, `src/style.css` | — | template Vite ; `main.ts` cible `#app` qui n'existe pas |
| ~~13 fonctions de `storage.ts`~~ | `storage.ts:13-184` | **retirées (tâche 13)** : seuls `getUser`/`setUser`/`clearUser` restent |
| ~~`getNextParcours`, `updateParcours`, `getMyWeekVote`~~ | `supabaseService.ts` | **retirés (tâche 13)** : aucun import |
| ~~`addParcours`, `deleteParcours` (import)~~ | `ParcoursList.tsx:11` | **retirés (tâche 13)** |
| ~~`handleCreateParcoursClick`~~ | `ParcoursList.tsx:163-165` | **retiré (tâche 13)** |
| ~~prop `onEdit` / `showActions` / `onView`~~ | `ParcoursCard.tsx` | **corrigé (tâche 14)** : `onEdit` ouvre la modale de renommage, `onReplaceGpx` remplace le tracé ; `showActions`/`onView` (jamais passées) retirées |
| ~~prop `compact`~~ | `WeatherCard.tsx` | **retirée (tâche 13)** |
| ~~prop `center`~~ | `MapView.tsx` | **retirée (tâche 13)** |
| ~~prop `onClick`~~ | `ui/Card.tsx` | **retirée (tâche 13)** |
| ~~prop `loading`~~ | `ui/Button.tsx` | **retirée (tâche 13)** |
| ~~`workbox-window`~~ | `package.json` | déclarée, importée nulle part — **retirée (tâche 1)** |
| `vite-plugin-pwa` | `package.json` | outil de **build** classé en `dependencies` (alors que `vite` est en `devDependencies`) |
| ~~types jamais consommés~~ | `types/index.ts` | **retirés (tâche 13)** : `Coordinates`, `Participation`, `ParticipationStatus`, ré-exports `ParcoursInsert`/`Attendance`/`AttendanceStatus` |

**Supprimés en tâche 2** : `src/main.ts`, `src/counter.ts`, `src/style.css`,
`src/assets/*` (3 fichiers), `public/icons.svg`, `tailwind.config.js` et
`fix_uuid.sql`. Le CSS produit a perdu 1,7 kB au passage. Attention : Tailwind v4
scanne **tout** le projet, y compris les `.md` — les utilitaires correspondants
réapparaissent donc dès qu'un document contient leurs noms (à cadrer en
tâche 12).

### F. Documentation fausse

| Fichier | Affirmation | Réalité |
|---|---|---|
| ~~`README.md:17`, `ARCHITECTURE.md:5`, `AGENTS.md:21,42`~~ | React 18 | React **19.3.0** installé — **corrigé (tâche 1)** |
| `useAttendance.ts:28` | « true si je viens **ou n'ai pas encore répondu** » | le code fait l'inverse : `showParcours: myStatus === 'going'` (`:151`) |
| ~~`supabaseService.ts:166`~~ | « un JOIN évite de les dupliquer » | aucune JOIN : deux requêtes séparées — **corrigé (tâche 3)** |
| `storage.ts:74-76` | « ce cache évite un aller-retour réseau au démarrage » | `useAuth.tsx:96` appelle la base à chaque montage |
| ~~`weatherApi.ts:101-105`~~ | « interprété… c'est ce qu'on veut » | faux hors du fuseau du navigateur — **corrigé (tâche 9)** : parsé en Europe/Paris |
| `adminCode.ts:36` | « comparaison à temps constant » | retour immédiat sur la longueur, donc non constant |
| ~~`schema.sql:10`~~ | « `backup.sh restore` pourPeupler » | le script est `backup.py` (et « pourPeupler » est collé) — **corrigé (tâche 3)** |
| ~~`AGENTS.md`~~ | `ParcoursVoteCard` = « 2 boutons de vote » | il y en a **1** (`ParcoursVoteCard.tsx:82-92`) — **corrigé (tâche 3)** |
| ~~`AGENTS.md`~~ | `Auth.tsx` = `LoginForm + UserMenu` | `UserMenu` est un fichier séparé — **corrigé (tâche 3)** |
| ~~`README.md:110`~~ | `dist/` prêt pour **GitHub Pages** | faux : aucun `base` dans `vite.config.ts`, et la PWA est en `scope:'/'` → cassé sur un sous-chemin — **corrigé (tâche 3)** |
| ~~`README.md:36-37`, `AGENTS.md`~~ | `VITE_DEFAULT_LAT` / `VITE_DEFAULT_LON` | **jamais lus** : `grep VITE_DEFAULT src/` = 0 ; `weatherApi.ts:17-18` utilise des constantes en dur — **retirées des docs (tâche 1)** |
| ~~`ARCHITECTURE.md:33`~~ | `useAuth.tsx` = `AuthProvider + useAuth + hashPin` | `hashPin` est dans `src/services/pin.ts` — **corrigé (tâche 3)** |
| ~~`ARCHITECTURE.md:38`~~ | `Auth.tsx` = `LoginForm + UserMenu` | `Auth.tsx:63` n'exporte que `LoginForm` — **corrigé (tâche 3)** |
| ~~`ARCHITECTURE.md:252-253`~~ | `src/hooks/useAuth.test.ts`, `useAuth.integration.test.ts` | ces chemins **n'existent pas** (le fichier réel est `useAuth.integration.test.tsx`) — **corrigé (tâche 3)** |
| ~~`schema.sql:7`~~ | `psql $VITE_SUPABASE_URL` | cette variable est une URL **REST**, pas une chaîne de connexion Postgres — **corrigé (tâche 3)** |
| ~~`schema.sql:10`~~ | `backup.sh restore` | le script est `backup.py` — **corrigé (tâche 3)** |
| ~~`ARCHITECTURE.md:169`, `AGENTS.md:106`~~ | horloge « tick 1 min » | `TICK_MS = 30_000` → **30 s** — **corrigé (tâche 3)** |
| ~~`README.md:47-48`~~ | `schema.test.ts` prouve que la prod correspond au fichier | il vérifie seulement la cohérence du **fichier** — **corrigé (tâche 3)** |

### G. Accessibilité — corrigé (tâche 16)

- Champs associés à un label : formulaire d’ajout de parcours (`Nom du parcours`, fichier GPX), renommage dans `UserMenu`. Les inputs fichier portent un `aria-label`.
- Modales avec `role="dialog"`, `aria-modal="true"` et `aria-labelledby` : `UserMenu`, `SecurityModal` (les autres l’avaient déjà).
- Fermeture par **Échap** sur toutes les modales (`AdminCodeModal`, `ConfirmDeleteModal`, `ParcoursRenameModal`, `SecurityModal`, renommage de `UserMenu`), jamais pendant une écriture.
- Boutons icône sans texte : `aria-label` sur le `✕` du formulaire de parcours.
- Erreurs dynamiques annoncées avec `role="alert"` : `Auth`, `Home` (présences, météo, votes), `UserMenu`, `SecurityModal`, formulaire de parcours.
- En-têtes de `ParticipantsTable` avec `scope="col"`.

### H. Outillage manquant

- ~~**Aucun linter**~~ **Linter ajouté (tâche 12)** : ESLint 10 +
  `typescript-eslint` + `eslint-plugin-react-hooks`, avec `npm run lint` et
  `npm run lint:fix`. Il reste un manque : aucun formateur.
- **Aucune CI — corrigé (tâche 24).** GitHub Actions exécute `npm ci`,
  `npm run lint`, `npm test` et `npm run build` sur chaque push vers `main` et
  chaque pull request (`.github/workflows/ci.yml`). Vercel, lui, ne lance que
  `npm run build` : sans CI, un test cassé pouvait être déployé.
- ~~`tsconfig.json` : **`strict` absent**, `noUnusedLocals: false`,
  `noUnusedParameters: false`~~ **Corrigé (tâche 12)** : `strict`,
  `noUnusedLocals` et `noUnusedParameters` sont activés. Les 15 symboles morts
  détectés ont été retirés.
- ~~`tsconfig.json` a `include: ["src"]`~~ **Corrigé (tâche 12)** :
  `vite.config.ts` est maintenant type-checké.
- ~~`npm test` termine avec une erreur non gérée du harnais
  (`removeEventListener` sur un objet qui n'est pas un `EventTarget`)~~ :
  **disparue** — suite relancée le 28/10/2026, 34 fichiers / 440 tests sans
  erreur de teardown.
- ~~Le mock Supabase global (`src/test/setup.ts:7-18`) ne définit ni `maybeSingle`,
  ni `in`, ni `ilike`, alors que le vrai service les utilise
  (`supabaseService.ts:35,80,132,170,269`)~~ **Complété (tâche 26)** : les trois
  méthodes sont dans le chaînage, comme celles que le service appelle
  réellement (`eq`, `select`, `single`, `order`, `limit`, `insert`, `update`,
  `upsert`, `delete`).

### I. Sauvegarde — `backup.py` (à traiter avant de s'en servir)

Aujourd'hui les tables sont minuscules (11 profils), donc rien de cassé. Les
points ci-dessous sont des pièges **latents**, à corriger avant d'en dépendre.

**I1 (corrigé, tâche 4). `save` pagine par 1 000 lignes** (`order=id.asc`,
`limit`/`offset`) et relit le fichier pour vérifier les comptes. PostgREST
plafonne à ~1000 lignes : plus de troncature silencieuse.

**I2 (corrigé, tâche 4). `restore` valide puis sauvegarde avant de détruire.**
Le fichier est refusé s'il manque une table, un `id`, un profil ou une
référence. Une sauvegarde `pre-restore` est prise automatiquement, la
suppression suit l'ordre inverse (plus de cascade), et les comptes sont
revérifiés après réécriture. **Limite assumée** : PostgREST n'offre pas de
transaction multi-requêtes ; une coupure réseau au milieu laisse une base
partielle, que la sauvegarde préalable permet de rejouer.

**I3 (corrigé, tâche 4). La séquence reste hors de portée de l'API REST.**
Le script calcule la valeur, affiche la commande `setval` exacte, puis sort
avec le **code 2** : impossible de croire que la restauration est finie sans
l'avoir exécutée. Oubliée, elle provoquerait un `duplicate key` à la prochaine
inscription — c'est précisément le scénario que `AGENTS.md` décrit comme
irréparable.

**I4 (corrigé, tâche 4). `.env` est prioritaire** sur le shell, avec un
avertissement si une variable exportée est remplacée. Un
`VITE_SUPABASE_URL` oublié dans le terminal ne peut plus détourner une
sauvegarde ou une restauration.

---

## 6. Ce qui n'est pas dans le dépôt

**Bien protégé :** `.env`, `.env.test` et `backups/` sont ignorés par git
(`.gitignore`), et `git ls-files` confirme qu'aucun n'est suivi. Seul
`.env.example` l'est.

**Base de test :** second projet Supabase (`lhotfhhatcxuhoazgtns`), utilisé par
`npm run dev:test` et `backup.py --env .env.test`. Toute manipulation de test
passe par là ; la prod ne reçoit que des lectures (`backup.py save`).

**Volontairement public :**

| Élément | Où | Pourquoi |
|---|---|---|
| Clé anon Supabase | `lib/supabase.ts` | publique par nature ; la protection repose sur la RLS |
| Code admin `2105` | présent **en clair** dans `dist/assets/index-*.js` | assumé : c'est un ralentisseur, pas une sécurité |
| RLS ouverte sur les 4 tables | `schema.sql:161-194` | personne ne peut lire/écrire sans la clé, mais tout porteur de la clé le peut |

**Le risque le plus lourd :** la politique `DELETE` est ouverte sur
`user_profiles` (`schema.sql:164`), et la clé étrangère est en `ON DELETE
CASCADE` (`:74,101`). Un simple `DELETE /user_profiles` avec la clé anon efface
**tous** les profils, donc tous les votes et toutes les présences. Ce n'est pas
hypothétique : c'est exactement ce que fait `backup.py restore` en premier
(§5.I2).

**Réserve à garder en tête :** tant que l'identité reste côté client, un
utilisateur curieux peut lire ou modifier les votes des autres, et lire
`pin_hash`. Acceptable pour un club de collègues, pas au-delà.

---

## 7. Checklist après un changement

```bash
npm test          # toute la suite, ~30 s
npm run build     # tsc + vite build
npm run dev       # puis vérifier à l'écran, en navigation privée
```

Avant de pousser (cf. `AGENTS.md`) : lister les fichiers, expliquer le
pourquoi, montrer les deux commandes, attendre l'accord.

Trois réflexes issus de bugs réels de ce projet :

1. **Un build vert ne prouve rien sur l'affichage.** Le défaut « Je viens paraît
   déjà sélectionné » est passé avec 282 tests verts. Vérifier à l'écran.
2. **Vérifier en production, pas seulement en local.** Le local et la prod
   partagent la même base Supabase.
3. **Toute modification de données passe par `return=representation`** pour
   relire ce qui a été touché. Trois parcours ont déjà été supprimés par erreur.

---

## 8. Plan de correction

**Règle du jeu :** une tâche à la fois. Avant chacune, je détaille ce que je vais
changer et pourquoi, puis j'attends une validation explicite. Après chacune,
`npm test` + `npm run build`, présentation du diff, et validation avant tout
`git push`.

Légende : `à faire` · `en cours` · `fait`

| # | Tâche | Ce que ça corrige | État |
|---|---|---|---|
| 1 | Dépendances et versions | `react`/`react-dom` non déclarés ; `workbox-window` inutile ; `vite-plugin-pwa` mal classé ; docs « React 18 » ; `VITE_DEFAULT_LAT/LON` fantômes | fait |
| 2 | Fichiers morts et dangereux | `fix_uuid.sql`, `main.ts`, `counter.ts`, `style.css`, `src/assets/`, `tailwind.config.js`, `public/icons.svg` | fait |
| 3 | Documentation fausse | `ARCHITECTURE.md` (hashPin, UserMenu, chemins de tests), `README.md` (GitHub Pages), `schema.sql` (backup.sh, psql), `AGENTS.md` (2 boutons) | fait |
| 4 | Sauvegarde `backup.py` | pagination du `save`, ordre de suppression, `--dry-run`, sauvegarde avant restauration, vérification des comptes, séquence | fait |
| 5 | Comptage des votes | A1, A2, C1 : une seule source de vérité, un seul total | fait |
| 6 | Règle « vote sans présence » | A3 : triggers `participations_require_going` + `attendances_remove_vote*`, orphelin #16 supprimé, `restore` refuse les dumps incohérents | fait |
| 7 | Résilience des erreurs | A6 (présence partielle), A7 (noms vides), C2 (`false` ambigu) | fait |
| 8 | Bascule du mercredi 14h | A4 : réponses obsolètes qui écrasent la nouvelle semaine | fait |
| 9 | Météo et fuseau horaire | A5 : `isoToEpoch` interprété dans le fuseau du navigateur | fait |
| 10 | Tracé GPX à la demande | D1 : 131 kB gzip de coordonnées à chaque cycle, pour rien | fait |
| 10b | Aperçu du tracé dans le vote | Suite de D1 : bouton « Voir le tracé » dans `ParcoursVoteCard`, une carte à la fois | fait |
| 11 | Requêtes redondantes | D2, D3, D4 : `getWeekAttendances` en double, rechargements trop larges, références instables | fait |
| 12 | `strict` + linter | H : `strict`, `noUnused*`, ESLint ; formateur/CI non retenus, 5 warnings `any` renvoyés en tâche 13 | fait |
| 13 | Code mort restant, logs, tests GPX | §5.E, D5, A8 : `storage.ts` réduit, 3 exports et 4 props mortes retirés, logs nettoyés, `gpxparser` remplacé, tests GPX | fait |
| 14 | Bouton « Modifier » / ré-import GPX | `onEdit` jamais fourni : deux actions sans effet | fait |
| 15 | Manifeste PWA | nom, langue, couleur, icônes de 309 octets | fait |
| 16 | Accessibilité | §5.G : labels, `role="dialog"`, Échap, `role="alert"`, `scope` | fait |
| 17 | Base : `updated_at`, index, unicité | A9, A10, D6 | fait |
| 18 | Données : PIN de `#14`, casse des noms | §5.B : choix assumés, aucune donnée modifiée | fait |
| 19 | Pluie à 0 % et heures autour du run | `WeatherCard` : pluie toujours affichée ; bandeau 11h → 14h (`getRunWindow`) | fait |
| 20 | Finitions d'interface (lot A) | une seule date, refus neutre, météo calmée, accent AA, cibles 44 px | fait |
| 21 | Horloge partagée | C5 : un seul `setInterval` pour toute l'app, libéré sans abonné, instantané stable entre deux ticks | fait |
| 22 | Chargement différé de la carte | D7 : Leaflet (~150 kB min / 43 kB gzip) sort du bundle principal, chargé au premier tracé | fait |
| 23 | Recalcul local des votes | C6 : un changement de présence ne relance plus de chargement ni n'efface l'affichage | fait |
| 24 | Intégration continue | H : lint + tests + build sur chaque push et PR — un test cassé ne part plus en prod | fait |
| 25 | Une seule définition par concept | C4 : `GPXPoint` unique, `ProfileIdentity` / `UserIdentity`, conversion centralisée | fait |
| 26 | Finitions de vocabulaire et de mock | C3 : `PresenceRow.status` ; `in`, `ilike`, `maybeSingle` ajoutés au mock Supabase | fait |

**Pourquoi cet ordre.** Les tâches 1 à 3 ne touchent aucune donnée et se
vérifient en une commande : autant commencer par elles. La tâche 4 vient
**avant toute écriture en base** (6, 17) parce que c'est le seul filet de
sécurité, et qu'il est troué. Les tâches 5 à 9 corrigent des comportements
faux. 10 et 11 allègent le réseau. 12 arrive après, pour ne pas noyer les
corrections métier sous des centaines d'erreurs de typage. 13 à 17 sont du
nettoyage et de la finition ; 18 s'est conclue sans écriture, par deux
décisions documentées (§5.B).

**Hors périmètre, volontairement :**

- **RLS ouverte** : la fermer suppose une vraie authentification serveur
  (Supabase Auth), donc un changement de modèle d'identité. À décider comme un
  projet, pas comme une correction.
- **Code admin dans le bundle** : assumé et documenté (§6).
- **Vote orphelin `#16`** : laissé tel quel, comme convenu.
- **Tables `profiles` / `responses`** : déjà supprimées par `schema.sql`.
