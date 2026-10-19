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
| `src/main.ts` | ⚠️ **mort** : template Vite, cible `#app` qui n'existe pas | 60 |
| `src/counter.ts` | ⚠️ **mort** : template Vite | 9 |
| `src/style.css` | ⚠️ **mort** : template Vite (l'app utilise `src/index.css`) | 296 |
| `src/assets/` | ⚠️ **mort** : `hero.png`, `typescript.svg`, `vite.svg`, importés seulement par `main.ts` | — |

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
| `src/components/MapView.tsx` | carte Leaflet : polyligne + marqueurs départ/arrivée | 127 |
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
| `src/services/supabaseService.ts` | toutes les requêtes Supabase | 317 |
| `src/services/gpxParser.ts` | parse GPX XML et JSON Strava, distance, dénivelé, simplification | 302 |
| `src/services/weatherApi.ts` | client Open-Meteo + sélection de la prévision du mercredi 12h30 | 231 |
| `src/services/storage.ts` | cache localStorage — **presque entièrement mort** (voir §5.E) | 183 |
| `src/services/weekKey.ts` | règle du cycle hebdomadaire et formatage | 87 |
| `src/services/weatherCode.ts` | codes WMO → emoji / libellé / classes Tailwind | 85 |
| `src/services/adminCode.ts` | lecture et comparaison du code admin, sans mémorisation | 50 |
| `src/services/pin.ts` | obfuscation du PIN 4 chiffres | 19 |

### 2.7 Types et utilitaires

| Fichier | Responsabilité | Lignes |
|---|---|---|
| `src/types/supabase.ts` | types des lignes DB en snake_case | 96 |
| `src/types/index.ts` | types applicatifs + ré-exports DB | 69 |
| `src/lib/supabase.ts` | instancie le client Supabase | 15 |
| `src/lib/utils.ts` | `cn()` = `clsx`, **sans fusion Tailwind** | 4 |
| `src/test/setup.ts` | mock global Vitest + nettoyage | 40 |

### 2.8 Tests

23 fichiers, 288 tests, ~30 s.

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
| `src/services/weatherCode.test.ts` | mapping des 28 codes WMO |
| `src/services/adminCode.test.ts` | verrou admin, ne mémorise rien |
| `src/hooks/useTargetWednesday.test.ts` | horloge de semaine |
| `src/components/AttendanceBanner.test.tsx` | aucun bouton rempli sans réponse |
| `src/components/ParcoursVoteCard.test.tsx` | bouton de vote |
| `src/components/ParticipantsTable.test.ts` | tri des lignes |
| `src/services/pin.test.ts` | `hashPin` |
| `src/pages/Home.weather.test.tsx` | météo sur la page d'accueil |

Le parser GPX (`gpxParser.ts`, 302 lignes) n'a **aucun test direct** : c'est la
plus grosse zone non couverte, alors qu'il traite deux formats et calcule le
dénivelé.

### 2.9 Base de données et scripts

| Fichier | Responsabilité | Lignes |
|---|---|---|
| `schema.sql` | structure complète, rejouable : tables, index, RLS, purge des tables mortes | 202 |
| `backup.py` | `save` / `list` / `restore` de la prod, via l'API REST | 192 |
| `fix_uuid.sql` | ⚠️ **dangereux et orphelin** : `created_by` est un `integer` (`schema.sql:58`) mais le script filtre sur un motif **UUID** — exécuté, il mettrait **tous** les `created_by` à `NULL` (voir §5.E) | 6 |
| `public/` | `favicon.svg`, `icons.svg`, 3 PNG (tous 309 octets : probablement des placeholders) | — |

### 2.10 Configuration

| Fichier | Responsabilité | À savoir |
|---|---|---|
| `vite.config.ts` | build + PWA + config Vitest | le manifeste PWA est écrit **ici**, pas dans `index.html` ; `includeAssets` cite `favicon.ico`, qui n'existe pas |
| `tsconfig.json` | TypeScript | ⚠️ **`strict` absent** ⇒ mode non-strict ; `noUnusedLocals: false` |
| `tailwind.config.js` | ⚠️ **ignoré** : Tailwind v4 lit `@theme` dans `src/index.css:1-12` | aucun `@config` ne le référence |
| `postcss.config.js` | `@tailwindcss/postcss` + autoprefixer | `autoprefixer` est redondant avec v4, sans effet |
| `.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_CODE` | non versionné ✅ |

#### Le manifeste PWA ne correspond pas à l'application

| Réglage | Valeur servie | Réalité de l'app |
|---|---|---|
| `name` / `short_name` | `Running Club` / `Running` | l'interface affiche **HappyRunners** |
| `lang` | `en` (défaut, absent de `vite.config.ts`) | toute l'interface est en français |
| `theme_color` | `#16a34a` (vert) | couleur de marque = `#593A5A` (violet, `src/index.css:4`) |
| icônes | 3 PNG de **309 octets** | placeholders, probablement illisibles à l'installation |
| `includeAssets` | `favicon.ico` | absent de `public/` (il y a `favicon.svg`) |

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
| Statut de vote `yes`/`no` | écrit en clair à 6 endroits (`types/supabase.ts:38,48`, `types/index.ts:49`, `supabaseService.ts:215,237,262,272,292`) | ⚠️ pas de type partagé ; `'no'` n'est **jamais écrit** par l'app |
| Code admin | `src/services/adminCode.ts` + `VITE_ADMIN_CODE` | ✅ mais présent **en clair** dans le bundle (§6) |
| Verrou admin = une page, une personne | `ParcoursList.tsx` (`useState`) | ✅ et verrouillé par 11 tests |
| PIN 4 chiffres | `src/services/pin.ts` + `user_profiles.pin_hash` | ⚠️ obfuscation, pas un vrai hash |
| Météo = prochaine sortie uniquement, 12h30 | `weatherApi.ts:73-105` | ✅ |

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

---

## 5. Dette classée par gravité

### A. Bugs à corriger

**A1. Une panne de chargement des présences efface tous les votes.**
`Home.tsx:70` passe toujours `goingUserNumbers`. Si `useAttendance` a échoué,
`attendees` est vide (`useAttendance.ts:47-56`), la liste vide fait autorité et
`useParcoursVotes.ts:91-113` filtre **tous** les votes. L'écran affiche zéro
vote alors que la requête de votes a réussi.

**A2. Totaux divergents entre les deux écrans (vérifié).**
`getWeekTallies` (`supabaseService.ts:242-255`) compte **tous** les votes, sans
filtrer les présents. `ParcoursList.tsx:138` l'utilise pour afficher les
compteurs, tandis que Home passe par le recomptage filtré de
`useParcoursVotes.ts:98-107`. Le vote orphelin `#16` (semaine `2026-10-14`,
confirmé en base) illustrerait la divergence : 1 sur la page de gestion, 0 sur
Home. Latent aujourd'hui (ces compteurs ne portent que sur la semaine en cours,
où il n'y a aucun vote), faux dès qu'un vote sans présence tombe dans la
semaine courante.

**A3. Rien n'empêche en base un vote sans présence.** Aucune contrainte ni
trigger ne lie `participations` à `attendances.status = 'going'`
(`schema.sql:98-117`). La règle est purement client — c'est exactement ce qui a
produit le vote orphelin `#16`.

**A4. Réponses obsolètes autour de la bascule du mercredi 14h.** Aucun hook de
données ne vérifie que la réponse concerne toujours la semaine demandée :
`useAttendance.ts:47-49`, `useParcoursVotes.ts:74-115`, `useParcours.ts:22-24`,
`useWeather.ts:66-71`. Seul `useAuth` a un garde `cancelled`
(`useAuth.tsx:92-97`). Une requête pour l'ancienne semaine qui résout après la
nouvelle écrase l'affichage.

**A5. Météo décalée hors du fuseau Europe/Paris.** `isoToEpoch`
(`weatherApi.ts:101-105`) interprète les heures Open-Meteo dans le fuseau **du
navigateur**, alors que la requête demande `timezone=Europe/Paris` (`:73`). Le
commentaire affirme que c'est voulu : c'est faux hors de France.
`weekKey.ts:53-55` reconnaît d'ailleurs ce risque pour la clé de semaine.

**A6. Erreur partiellement fausse sur la présence.** Si `setAttendance` réussit
mais `deleteWeekVote` échoue (`useAttendance.ts:110-122`), l'UI revient en
arrière et affiche une erreur alors que la présence **est** enregistrée. Le
rechargement suivant corrige l'affichage, pas la confusion.

**A7. Les noms des participants peuvent disparaître en silence.**
`getWeekAttendances` ignore l'erreur de la seconde requête (`:167-170`) et
renvoie des noms vides (`:179-184`), sans remonter d'erreur.

**A8. Dénivelé faussé si le premier point a une altitude non nulle.**
`gpxParser.ts:245-252` part de 0 : un départ à 150 m ajoute +150 m au D+.

**A9. `updated_at` n'est jamais écrit.** Le trigger est commenté
(`schema.sql:127-137`) et le code ne compense pas : ni `addParcours`
(`supabaseService.ts:41-50`), ni `updateParcours` (`:52-58`), ni les upserts de
présence et de vote ne touchent la colonne. Seul `updateUserProfile` le fait
(`:109`). Les colonnes `updated_at` de `parcours`, `attendances` et
`participations` mentent donc : elles valent l'heure d'insertion.

**A10. Pas d'unicité sur le nom.** Aucune contrainte ni index sur
`(first_name, last_name)` (`schema.sql:27-41`), alors que `findProfileByName`
filtre en `ilike` sur ces deux colonnes (`supabaseService.ts:127-132`) et
termine par `.maybeSingle()`. Deux « Julie Moudin » feraient échouer la
reconnexion (et non renvoyer la première). Aujourd'hui la base n'a aucun
doublon — c'est un piège, pas un incident.

**A11. `fix_uuid.sql` détruirait `created_by`.** `created_by` est un `integer`
(`schema.sql:58`), mais le script fait
`WHERE created_by::text NOT LIKE '________-____-____-____-____________'` :
pour un entier comme `3`, la condition est vraie, donc **toutes** les lignes
seraient mises à `NULL`. Le fichier n'est référencé nulle part. À supprimer.

### B. Propreté des données (constaté en base le 19/10/2026)

| Constat | Détail |
|---|---|
| 11 membres, 10 avec PIN | **`#14 Julie Moudin` n'a pas de PIN** → n'importe qui peut se faire passer pour elle |
| 1 vote orphelin | `#16 Cinthia Marquant`, semaine `2026-10-14`, aucune présence |
| Casse inhabituelle | `#13 HOUTMANN`, `#15 ZILLIOX` (les autres sont en `Title Case`) |
| Trou dans la séquence | `user_number` : 3 puis 8 → 17 (4, 5, 6, 7 absents) |
| 5 parcours créés le même jour | tous le `2026-10-06` |
| Tracés | les 5 ont leurs points (1 932 à 3 174 par parcours) |

### C. Incohérences de logique

**C1.** Deux algorithmes de comptage non équivalents (voir A2), aucune fonction
partagée.

**C2.** `verifyUserPin`, `setPin`, `clearPin`, `profileExists` renvoient `false`
aussi bien pour un refus métier que pour une panne réseau
(`useAuth.tsx:188-191,212-215,268-271,288-291`) : l'interface ne peut pas
distinguer les deux.

**C3.** Trois vocabulaires pour la même notion à la frontière UI ↔ service :
`presence` / `attendance`, `Attendee.status` → `PresenceRow.attendance`
(`ParticipantsTable.tsx:9`), `user?.id` passé à `currentUserNumber`
(`Home.tsx:341`).

**C4.** Conversion snake_case ↔ camelCase refaite à la main dans chaque
fonction (`supabaseService.ts:179-184,233-238`, `useAuth.tsx:57-63`). Deux types
`Participation` différents (`types/supabase.ts:34-42` vs `types/index.ts:51-59`)
et `GPXPoint` dupliqué (`types/index.ts:6-11`, `types/supabase.ts:1-6`).

**C5.** `useTargetWednesday` instancié **cinq fois** (`Home.tsx:33`,
`useAttendance.ts:41`, `useParcoursVotes.ts:61`, `useWeather.ts:28`,
`ParcoursList.tsx:20`), donc cinq `setInterval` — alors que son propre
commentaire (`useTargetWednesday.ts:8-11`) demande de le monter une seule fois.

**C6.** `useParcoursVotes` relance un chargement réseau complet à chaque
changement de la liste des présents (`:65,125,138-141`) : le commentaire
`:63-64` annonce un simple recalcul local.

### D. Performance

**D1. `getParcours` rapatrie 1,1 Mo de coordonnées à chaque cycle.**
Mesuré : `parcours?select=*` = **1 135 kB brut / 131 kB gzip**, contre **830
octets** sans la colonne `points`. Les points ne servent qu'à `MapView`
(`ParcoursCard.tsx:128-131`) — donc à la carte dépliée, pas à la liste. Piste :
charger `points` à la demande.

**D2. `getWeekAttendances` appelé deux fois par cycle, un résultat jeté**
(`useAttendance.ts:76-78` et `useParcoursVotes.ts:74-77,91-96`).

**D3. Rechargements trop larges après une action** : `toggleChoice` recharge
votes **et** présences (`useParcoursVotes.ts:209`) alors que seule
`participations` a changé ; `setAttendance` puis `deleteWeekVote` sont
séquentiels alors qu'ils sont indépendants (`useAttendance.ts:111-117`).

**D4. Nouvelle référence d'objet à chaque polling**, donc re-rendu de Home
toutes les 30 s même quand rien ne change : `useAttendance.ts:48`,
`useParcours.ts:23-24`, `useParcoursVotes.ts:107,114`.

**D5. Bundle 738 kB** (warning Vite). 52 `console.*` en production, dont **27
dans `gpxParser.ts`** (jusqu'à 500 caractères de GPX loggés,
`gpxParser.ts:15-18,24-28,57-61,89-98`).

**D6. Index redondant.** `idx_attendances_week` (`schema.sql:84-85`) duplique le
préfixe de l'index unique `(week_key, user_number)` (`:81-82`). En revanche, il
**manque** un index sur les colonnes de `findProfileByName` (voir A10).

**D7. Aucun découpage du bundle.** Pas de `build.rollupOptions.manualChunks`
(`vite.config.ts`) : Leaflet et le parseur partent dans le même fichier que le
reste de l'application.

### E. Code mort et fichiers orphelins

| Élément | Référence | Note |
|---|---|---|
| `src/main.ts`, `src/counter.ts`, `src/style.css` | — | template Vite ; `main.ts` cible `#app` qui n'existe pas |
| 13 fonctions de `storage.ts` | `storage.ts:13-184` | seuls `getUser`/`setUser`/`clearUser` sont utilisés |
| `getNextParcours`, `updateParcours`, `getMyWeekVote` | `supabaseService.ts:28,52,258` | aucun import |
| `addParcours`, `deleteParcours` (import) | `ParcoursList.tsx:11` | importés, jamais utilisés |
| `handleCreateParcoursClick` | `ParcoursList.tsx:163-165` | défini, jamais appelé |
| prop `onEdit` / `showActions` / `onView` | `ParcoursCard.tsx:14,17,29,49,103` | jamais passées ⇒ **bouton crayon et ré-import GPX sans effet** |
| prop `compact` | `WeatherCard.tsx:9,37-53` | branche morte |
| prop `center` | `MapView.tsx:17-18,31-33` | branche morte |
| prop `onClick` | `ui/Card.tsx:6,14,17` | jamais utilisée |
| prop `loading` | `ui/Button.tsx:7,36-41` | jamais passée ⇒ spinner mort |
| `src/assets/` | racine | `hero.png`, `typescript.svg`, `vite.svg` : importés **uniquement** par `main.ts` |
| ~~`workbox-window`~~ | `package.json` | déclarée, importée nulle part — **retirée (tâche 1)** |
| `vite-plugin-pwa` | `package.json` | outil de **build** classé en `dependencies` (alors que `vite` est en `devDependencies`) |
| `tailwind.config.js` | racine | **ignoré** par Tailwind v4 (pas de `@config`) |
| `fix_uuid.sql` | racine | dangereux et orphelin — voir A11 |
| types jamais consommés | `Coordinates`, `Participation`, `ParticipationStatus`, `Attendance`, plus 8 types de retour exportés | — |

### F. Documentation fausse

| Fichier | Affirmation | Réalité |
|---|---|---|
| ~~`README.md:17`, `ARCHITECTURE.md:5`, `AGENTS.md:21,42`~~ | React 18 | React **19.3.0** installé — **corrigé (tâche 1)** |
| `useAttendance.ts:28` | « true si je viens **ou n'ai pas encore répondu** » | le code fait l'inverse : `showParcours: myStatus === 'going'` (`:151`) |
| `supabaseService.ts:166` | « un JOIN évite de les dupliquer » | aucune JOIN : deux requêtes séparées |
| `storage.ts:74-76` | « ce cache évite un aller-retour réseau au démarrage » | `useAuth.tsx:96` appelle la base à chaque montage |
| `weatherApi.ts:101-105` | « interprété… c'est ce qu'on veut » | faux hors du fuseau du navigateur (voir A5) |
| `adminCode.ts:36` | « comparaison à temps constant » | retour immédiat sur la longueur, donc non constant |
| `schema.sql:10` | « `backup.sh restore` pourPeupler » | le script est `backup.py` (et « pourPeupler » est collé) |
| `AGENTS.md` | `ParcoursVoteCard` = « 2 boutons de vote » | il y en a **1** (`ParcoursVoteCard.tsx:82-92`) |
| `AGENTS.md` | `Auth.tsx` = `LoginForm + UserMenu` | `UserMenu` est un fichier séparé |
| `README.md:110` | `dist/` prêt pour **GitHub Pages** | faux : aucun `base` dans `vite.config.ts`, et la PWA est en `scope:'/'` → cassé sur un sous-chemin |
| ~~`README.md:36-37`, `AGENTS.md`~~ | `VITE_DEFAULT_LAT` / `VITE_DEFAULT_LON` | **jamais lus** : `grep VITE_DEFAULT src/` = 0 ; `weatherApi.ts:17-18` utilise des constantes en dur — **retirées des docs (tâche 1)** |
| `ARCHITECTURE.md:33` | `useAuth.tsx` = `AuthProvider + useAuth + hashPin` | `hashPin` est dans `src/services/pin.ts` |
| `ARCHITECTURE.md:38` | `Auth.tsx` = `LoginForm + UserMenu` | `Auth.tsx:63` n'exporte que `LoginForm` |
| `ARCHITECTURE.md:252-253` | `src/hooks/useAuth.test.ts`, `useAuth.integration.test.ts` | ces chemins **n'existent pas** (le fichier réel est `useAuth.integration.test.tsx`) |
| `schema.sql:7` | `psql $VITE_SUPABASE_URL` | cette variable est une URL **REST**, pas une chaîne de connexion Postgres |
| `schema.sql:10` | `backup.sh restore` | le script est `backup.py` |

### G. Accessibilité

- Champs sans label associé : `ParcoursList.tsx:269-276`, `UserMenu.tsx:132-142` ;
  `<label>` sans `htmlFor` : `ParcoursList.tsx:279-287`.
- Modales sans `role="dialog"` ni `aria-modal` : `UserMenu.tsx:113-156`,
  `SecurityModal.tsx:134-135` (les deux autres modales les ont).
- Fermeture par Échap absente partout sauf `ConfirmDeleteModal.tsx:29-35`.
- Bouton `✕` sans `aria-label` : `ParcoursList.tsx:264-266`.
- Erreurs sans `role="alert"` : `Auth.tsx:224,294,349`, `Home.tsx:195,281`,
  `UserMenu.tsx:125`, `SecurityModal.tsx:162`.
- `<th>` sans `scope="col"` : `ParticipantsTable.tsx:110-112`.

### H. Outillage manquant

- **Aucun linter, aucun formateur, aucune CI** (ni `.eslintrc`, ni `prettier`,
  ni `.github/`, ni `.editorconfig`).
- `tsconfig.json` : **`strict` absent**, `noUnusedLocals: false`,
  `noUnusedParameters: false`. Conséquence : « 0 erreur TypeScript » ne garantit
  pas grand-chose, et c'est ce qui laisse passer les imports morts ci-dessus.
- `npm test` termine avec une erreur non gérée du harnais :
  `TypeError: 'removeEventListener' called on an object that is not a valid
  instance of EventTarget` (teardown jsdom ↔ Vitest). Sans effet sur les
  résultats, mais bruit permanent qui finira par masquer un vrai échec.
- `tsconfig.json` a `include: ["src"]` : `vite.config.ts` n'est pas type-checké.
- Le mock Supabase global (`src/test/setup.ts:7-18`) ne définit ni `maybeSingle`,
  ni `in`, ni `ilike`, alors que le vrai service les utilise
  (`supabaseService.ts:35,80,132,170,269`) : ce mock ne peut pas exercer le
  service réel.

### I. Sauvegarde — `backup.py` (à traiter avant de s'en servir)

Aujourd'hui les tables sont minuscules (11 profils), donc rien de cassé. Les
points ci-dessous sont des pièges **latents**, à corriger avant d'en dépendre.

**I1. `save` ne pagine pas.** `GET /rest/v1/<table>?select=*` sans en-tête
`Range` (`backup.py:86-87`). PostgREST plafonne par défaut à ~1000 lignes : au
delà, la sauvegarde est **tronquée en silence**, et le compte affiché est celui
des lignes reçues. Sans risque à 11 profils ; faux un jour — et c'est justement
le jour où on en aura besoin.

**I2. `restore` détruit d'abord, sans transaction.** `api_delete_all()`
(`:100-103`) vide chaque table avant de réinsérer. Comme `TABLES` commence par
`user_profiles` (`:32`) et que les clés étrangères sont en `ON DELETE CASCADE`
(`schema.sql:74,101`), vider `user_profiles` emporte **immédiatement**
`attendances` et `participations`. Une interruption au milieu = perte totale,
sans retour possible.

**I3. La séquence n'est pas avancée.** Le script réinsère les `user_number`
d'origine mais ne repositionne pas `user_number_seq` : il se contente
d'**imprimer** une commande à lancer à la main (`:164-168`). Oubliée →
`duplicate key` à la prochaine inscription, ce qui est précisément le scénario
que `AGENTS.md` décrit comme irréparable.

**I4. `load_env` utilise `setdefault`** (`:58`) : une variable déjà présente
dans le shell **prime** sur `.env`. Un `VITE_SUPABASE_URL` exporté par erreur
fait pointer la sauvegarde — ou la restauration — vers une autre base.

---

## 6. Ce qui n'est pas dans le dépôt

**Bien protégé :** `.env` et `backups/` sont ignorés par git
(`.gitignore`), et `git ls-files` confirme qu'aucun des deux n'est suivi. Seul
`.env.example` l'est.

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
npm test          # 288 tests, ~30 s (ignorer l'erreur removeEventListener du teardown)
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
| 2 | Fichiers morts et dangereux | `fix_uuid.sql`, `main.ts`, `counter.ts`, `style.css`, `src/assets/`, `tailwind.config.js`, `public/icons.svg` | à faire |
| 3 | Documentation fausse | `ARCHITECTURE.md` (hashPin, UserMenu, chemins de tests), `README.md` (GitHub Pages), `schema.sql` (backup.sh, psql), `AGENTS.md` (2 boutons) | à faire |
| 4 | Sauvegarde `backup.py` | pagination du `save`, ordre de suppression, `--dry-run`, sauvegarde avant restauration, vérification des comptes, séquence | à faire |
| 5 | Comptage des votes | A1, A2, C1 : une seule source de vérité, un seul total | à faire |
| 6 | Règle « vote sans présence » | A3 : la faire tenir en base, ou l'assumer explicitement | à faire |
| 7 | Résilience des erreurs | A6 (présence partielle), A7 (noms vides), C2 (`false` ambigu) | à faire |
| 8 | Bascule du mercredi 14h | A4 : réponses obsolètes qui écrasent la nouvelle semaine | à faire |
| 9 | Météo et fuseau horaire | A5 : `isoToEpoch` interprété dans le fuseau du navigateur | à faire |
| 10 | Tracé GPX à la demande | D1 : 131 kB gzip de coordonnées à chaque cycle, pour rien | à faire |
| 11 | Requêtes redondantes | D2, D3, D4 : `getWeekAttendances` en double, rechargements trop larges | à faire |
| 12 | `strict` + linter | H : ce qui laisse passer imports morts et props fantômes | à faire |
| 13 | Code mort restant, logs, tests GPX | §5.E, D5 : `storage.ts`, props mortes, 52 `console.*`, parser non testé | à faire |
| 14 | Bouton « Modifier » / ré-import GPX | `onEdit` jamais fourni : deux actions sans effet | à faire |
| 15 | Manifeste PWA | nom, langue, couleur, icônes de 309 octets | à faire |
| 16 | Accessibilité | §5.G : labels, `role="dialog"`, Échap, `role="alert"`, `scope` | à faire |
| 17 | Base : `updated_at`, index, unicité | A9, A10, D6 | à faire |
| 18 | Données : PIN de `#14`, casse des noms | §5.B | à faire |

**Pourquoi cet ordre.** Les tâches 1 à 3 ne touchent aucune donnée et se
vérifient en une commande : autant commencer par elles. La tâche 4 vient
**avant toute écriture en base** (6, 17, 18) parce que c'est le seul filet de
sécurité, et qu'il est troué. Les tâches 5 à 9 corrigent des comportements
faux. 10 et 11 allègent le réseau. 12 arrive après, pour ne pas noyer les
corrections métier sous des centaines d'erreurs de typage. 13 à 18 sont du
nettoyage et de la finition.

**Hors périmètre, volontairement :**

- **RLS ouverte** : la fermer suppose une vraie authentification serveur
  (Supabase Auth), donc un changement de modèle d'identité. À décider comme un
  projet, pas comme une correction.
- **Code admin dans le bundle** : assumé et documenté (§6).
- **Vote orphelin `#16`** : laissé tel quel, comme convenu.
- **Tables `profiles` / `responses`** : déjà supprimées par `schema.sql`.
