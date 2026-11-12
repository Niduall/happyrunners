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
npm run test:e2e   # Bout en bout (Playwright, base de test)
npm run test:e2e:ui
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
- **PWA**: vite-plugin-pwa, autoUpdate ; manifeste dans `src/config/pwaManifest.ts` (nom, `lang: fr`, couleur de marque, icônes PNG testées) ; mise à jour surveillée par `src/services/swUpdate.ts`
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
| `src/components/ParticipantsTable.tsx` | Tout le groupe : présents en lignes (avec parcours), sans-réponse et absents en puces |
| `src/pages/Chat.tsx` | fil de discussion `/messages` : jours, auto-défilement, noms en double |
| `src/components/ChatComposer.tsx` | saisie du chat (Entrée envoie, Maj+Entrée à la ligne) |
| `src/components/ChatMessageBubble.tsx` | bulle, état d'envoi, suppression par l'auteur |
| `src/components/MessagesButton.tsx` | entrée Messages de l'en-tête + pastille de non-lus |
| `src/components/RequireUser.tsx` | réserve une route aux personnes connectées (redirige vers `/`) |
| `src/pages/Admin.tsx` | console admin : réinitialiser ou retirer le PIN d'une personne |
| `src/components/AdminPinResetModal.tsx` | PIN provisoire ou retrait, sans jamais afficher le hash |

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
- **Une écriture optimiste invalide les chargements déjà partis** : dans
  `useAttendance`, `setMyStatus` incrémente `mutationRef`, et `loadAll` ignore
  une réponse dont la mutation a changé entre-temps. Sans ça, cliquer
  « Je viens » pendant le chargement initial réappliquait l'ancien état et
  verrouillait les parcours jusqu'au polling suivant (30 s). Même principe que
  `mutationRef` dans `useMessages`.

### Fil de discussion (chat)
- Table `messages` : **pas de `week_key`**. La fenêtre est **glissante de
  30 jours** (`MESSAGE_RETENTION_DAYS`), calculée depuis `created_at`. Un
  message du mercredi reste donc visible le mardi suivant, puis sort seul.
- **Le chat est réservé aux personnes connectées** : la route `/messages` est
  enveloppée par `RequireUser`, qui redirige vers `/` (et empêche le montage,
  donc les requêtes) sans identité. L'entrée « Messages » et la pastille
  n'apparaissent que si `isAuthenticated` ; `useUnreadMessages(enabled)` ne
  compte rien pour un visiteur. `useMessages(null)` continue de refuser
  l'envoi : un message doit avoir un auteur.
- **Pas de Realtime.** Le plan gratuit est instable (piège 7) et tout le projet
  fonctionne au polling. `useMessages` interroge toutes les **5 s** quand le
  chat est visible, **30 s** en arrière-plan, et immédiatement au retour sur
  l'onglet. Ne pas réintroduire de websocket pour « faire plus vivant ».
- **Aucune politique UPDATE** : un message ne s'édite pas, même avec la clé
  anon. La longueur (1 à 500) est un `CHECK` en base, pas seulement côté UI.
- **Purge** : `purgeOldMessages()` au chargement du chat, avec la **même
  borne** que la lecture (`retentionCutoff()`). Pas de cron, pas de fonction
  planifiée ; si personne n'ouvre le chat, rien n'est purgé et ce n'est pas
  grave — la lecture filtre déjà.
- **Envoi optimiste** : le message apparaît en local (`pending-…`), puis est
  remplacé par la ligne serveur. En cas d'échec il reste affiché en `failed`
  avec un réessai — le polling ne doit jamais l'effacer.
- Un polling **parti avant** une écriture locale est ignoré (`mutationRef`) :
  sa réponse ne connaît pas le message qu'on vient d'envoyer et le ferait
  disparaître.
- **Non-lus** : `lastReadAt` en `localStorage`, par appareil. Sans valeur
  (première visite), la pastille reste à zéro : on n'annonce pas 30 jours de
  messages comme non lus.
- **La pastille ne charge pas les messages** : `useUnreadMessages` fait un
  `count` toutes les 30 s, au retour sur l'onglet et quand un autre onglet
  change la dernière lecture. Ne pas y brancher `getRecentMessages`.
- **Ses propres messages ne comptent jamais** : `countMessagesSince(since, me)`
  ajoute `.neq('user_number', me)`. À l'envoi, on enregistre le `created_at`
  **serveur** du message enregistré : l'heure locale du message optimiste peut
  être en retard de quelques centaines de millisecondes et rallumait la
  pastille après chaque envoi.
- **Le chat ouvert vaut lecture** : `Chat` appelle `markAllRead()` après
  chargement. Revenir à l'accueil doit éteindre la pastille sans action.
- **Un vrai fil, pas une liste inversée** : le plus ancien en haut, arrivée en
  bas. Si la personne lisait plus haut, ne pas lui voler son défilement :
  afficher « Nouveau message », sauf pour son propre envoi.
- **Deux prénoms identiques** : ajouter l'initiale du nom (« Julie D. »,
  « Julie M. ») uniquement quand le prénom est en double. Ne pas afficher le
  nom complet en permanence : le groupe se connaît.
- **La saisie du chat est à 16 px sur mobile** (`text-base sm:text-sm`) :
  en dessous, Safari iOS zoome automatiquement sur le champ et la page reste
  agrandie. Ne pas repasser le champ en `text-sm` sans le préfixe responsive.
- **Un message ne s'édite pas.** Suppression immédiate par son auteur, sans
  confirmation, bouton discret à gauche de la bulle. Le rouge reste réservé à
  cette action et aux erreurs.
- **Réactions : une seule par personne et par message.** La clé primaire
  `message_reactions(message_id, user_number)` porte la règle ; réagir à
  nouveau remplace la ligne (upsert), réappuyer sur le même emoji la retire.
  Ne pas autoriser plusieurs emoji par personne sans changer la clé primaire.
- **La palette est fixe** (`like`, `love`, `laugh`, `run`, `fire` dans
  `messages.ts`). On stocke la **clé**, pas l'emoji : changer un emoji ne
  demande aucune migration. Ne pas accepter un emoji arbitraire venu du
  clavier sans élargir le `CHECK` et la largeur des pastilles.
- **Les réactions se chargent avec le message** (`select` imbriqué
  `message_reactions(user_number,reaction)`) : pas de N+1 à chaque polling de
  5 s. Un message optimiste (`pending-…`) n'a pas d'identifiant serveur et ne
  peut pas recevoir de réaction.
- **Bascule optimiste** : la pastille change immédiatement, puis le serveur
  est prévenu ; en cas d'échec, l'état exact d'avant est restauré. Comme pour
  l'envoi, incrémenter `mutationRef` invalide les pollings déjà partis.
- **Appui long = palette** (450 ms, annulé dès 8 px de mouvement) : c'est le
  geste des messageries, disponible sur tous les messages. Les messages reçus
  ont en plus un **bouton smiley à droite**, affiché au survol ou au focus
  clavier — indispensable à ces deux usages, qui ne peuvent pas « appuyer
  longuement » ; les pastilles existantes sont aussi des boutons. Il reste dans
  le DOM et redevient cliquable au survol/focus (`pointer-events`), et visible
  tant que la palette est ouverte.
- **Qui a réagi : un appui sur une pastille** ouvre la liste des personnes,
  comme sur WhatsApp ; elle n'est jamais affichée au repos. Le tap ne bascule
  donc plus la réaction : ajouter ou retirer se fait dans la palette, où
  l'emoji déjà choisi est marqué. Les pastilles **chevauchent le bord bas de la
  bulle**, calées sur son coin extérieur (gauche pour un message reçu, droite
  pour le sien), avec un anneau `ring-gray-50` qui les détache de la bulle,
  comme sur WhatsApp. La liste est triée par prénom, nomme la
  personne connectée « (vous) », se ferme au clic extérieur et par Échap (le
  focus revient à la pastille). `summarizeReactions` expose les `userNumbers`
  triés par `user_number` pour que l'ordre ne change pas d'un polling à
  l'autre ; les prénoms viennent de la map déjà calculée par `Chat` (initiale
  du nom en cas de doublon).
- **La sélection de texte est coupée sur mobile** (`@media (hover: none)` dans
  `index.css`, classe `.chat-message-text`) : sans ça, l'appui long ouvre le
  menu natif et ses poignées par-dessus la palette. D'où **« Copier le
  message »** dans la palette, qui garde la copie possible. Sur ordinateur,
  la sélection reste active.
- **L'heure est dans la bulle**, sur la **dernière ligne** du texte, comme sur
  WhatsApp : elle flotte à droite (`float-right`), ce qui réserve sa place sans
  créer de seconde ligne, avec seulement 2 px de descente
  (`translate-y-0.5`). Elle est à **10 px** (métadonnée, seule exception à la
  règle des 12 px). Ne pas la descendre au bas de la bulle : les bulles courtes
  s'élargissaient et gardaient un vide en haut à droite. L'avatar est aligné sur
  le haut de la bulle.
- **Le bouton de réaction n'apparaît qu'au survol ou au focus** des messages
  reçus, à droite de la bulle, sans superposition. Il reprend **le design de la
  prod** : icône grise de 32 px (`h-8 w-8`), sans bordure ni fond, 44 px de
  cible (`after:-inset-1.5`), fond gris et accent au survol. Au repos il est
  invisible **et non cliquable** (`pointer-events-none`) pour ne pas capter un
  tap sur mobile ; il reste dans le DOM pour le clavier et les lecteurs
  d'écran, et redevient visible/cliquable au `group-hover` ou au
  `focus-visible`. Les messages envoyés n'en ont pas : on ne réagit presque
  jamais à son propre message, et l'appui long reste disponible. Ne pas le
  remettre au-dessus de la bulle ni à cheval sur son bord, et ne pas le rendre
  permanent.
- **Cibles tactiles** : les pastilles font 36 px de haut mais 44 px de cible
  (`after:-inset-1`) ; le bouton smiley 32 px → 44 px (`after:-inset-1.5`).
  Ne pas retirer ces pseudo-éléments en « simplifiant » les classes.
- **La palette se retourne** vers le bas quand la bulle est à moins de 190 px
  du haut : sinon elle sort de la zone de défilement. Elle se ferme au clic
  extérieur, par Échap, et après un choix.
- **Aucune notification push pour une réaction** : un 👍 n'allume pas le
  téléphone de l'auteur.
- **Réponse citée** : `reply_to_id` garde le lien, `reply_to_body` et
  `reply_to_user_number` sont un **instantané** pris à l'envoi. Un message
  n'étant jamais modifié, l'instantané ne peut pas diverger ; il survit à la
  purge des 30 jours, qui remet seulement `reply_to_id` à NULL. Les deux clés
  étrangères sont en `ON DELETE SET NULL` : supprimer l'original ou son auteur
  n'emporte jamais la réponse. « Répondre » vit dans la palette (appui long,
  clic droit, ou bouton smiley sur les messages reçus), pas dans un bouton
  permanent sur la bulle. Le bandeau du composeur s'annule sans vider le texte
  déjà saisi, et la saisie reprend le focus après le choix.
- ⚠️ **Ordre de déploiement obligatoire** : appliquer la migration
  `message_reactions` **avant** de déployer l'interface. La requête du chat
  référence la table : sans elle, `getRecentMessages` échoue et le fil ne
  s'affiche plus. Test d'abord, prod ensuite.
- ⚠️ **Même ordre pour la réponse citée** : appliquer
  `migrations/2026-11-10_tache34_reponse_chat.sql` avant de déployer
  l'interface. `getRecentMessages` et `sendMessage` sélectionnent les trois
  colonnes `reply_to_*` : sans elles, le chat entier tombe.

### Mise à jour de la PWA
- Un onglet ouvert **ne se met jamais à jour seul** : il enregistre le service
  worker une fois, puis exécute le JS déjà chargé. `skipWaiting` +
  `clientsClaim` font prendre la main au nouveau worker, mais seul un
  rechargement va chercher le nouveau bundle.
- `src/services/swUpdate.ts` (appelé depuis `main.tsx`, **en production
  seulement**) : `register('/sw.js')`, `update()` toutes les 30 min, au retour
  sur l'onglet (`visibilitychange`) et à la restauration (`pageshow`), puis
  rechargement différé de 2 s sur `controllerchange`.
- ⚠️ Le **premier** `controllerchange` ne recharge pas : c'est `clientsClaim`
  qui prend en charge une page vierge, pas une mise à jour. On ne fige pas
  l'état au démarrage (`Boolean(controller)`) — un onglet ouvert avant la
  première activation ne se mettrait alors jamais à jour. C'est le premier
  événement qui est ignoré, les suivants rechargent.
- `injectRegister: false` dans `vite.config.ts` : c'est nous qui enregistrons.
  Sans `injectRegister`, le plugin **n'ajoute plus** `skipWaiting`/
  `clientsClaim` tout seul → ils sont déclarés explicitement dans `workbox`,
  sinon la nouvelle version resterait en attente et aucun rechargement
  n'aurait lieu.
- Un `update()` sans nouvelle version renvoie un 304 : pas de rechargement,
  pas de clignotement. Un simple commit de doc change le CSS (Tailwind scanne
  les `.md`), donc le `sw.js` : les onglets ouverts se rechargent aussi. C'est
  rare et sans conséquence.
- Vérifié de bout en bout en `preview` : rebuild à chaud → `visibilitychange`
  → rechargement automatique en moins de 8 s.

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
- Les quatre heures du bandeau sont **traitées à l'identique** : ne pas
  ré-encadrer celle du run (ni anneau, ni fond, ni titre au survol). La
  prévision du run est déjà la carte du dessus ; le cadre ne faisait que
  désigner une case sur quatre.
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

### Console d'administration (PIN)
- `/admin` sert à **réinitialiser un PIN oublié**, pas à consulter un code :
  `getProfilesWithPinStatus` lit `pin_hash` uniquement pour renvoyer
  `hasPin: boolean`. **Ne jamais faire remonter le hash** dans un composant,
  un log ou un test.
- Accès protégé par le **même code** que la gestion des parcours
  (`VITE_ADMIN_CODE`), redemandé à chaque visite et jamais stocké. La page
  refuse aussi l'accès direct si le code n'est pas configuré.
- Deux actions : **PIN provisoire** (4 chiffres saisis deux fois, affiché une
  seule fois dans la confirmation pour transmission) ou **retrait** du PIN.
  Aucune des deux ne demande l'ancien code — c'est tout l'intérêt.
- **Aucune migration** : `user_profiles.pin_hash` et sa politique `UPDATE`
  existent déjà. `resetUserPin` réutilise `updateUserProfile`, donc
  `updated_at` suit la règle habituelle.
- La personne réinitialisée garde sa session en cours. Le nouveau PIN lui est
  demandé à la prochaine ouverture **si** son appareil n'est pas déjà de
  confiance ; le retrait la laisse se connecter sans code jusqu'à ce qu'elle
  en définisse un.
- **L'écran de connexion n'a plus de bouton « J'ai oublié mon PIN »** : il
  affiche la marche à suivre (demander à un administrateur). Ne pas
  réintroduire un bouton qui déconnecte en laissant croire que le PIN est
  définitif — c'était faux depuis l'ajout de la console.

### PIN et appareil de confiance
- Un PIN saisi n'est **pas redemandé à chaque ouverture**. `pinTrust.ts`
  mémorise `{ userNumber, verifiedAt }` dans `localStorage` pendant
  **30 jours** (`PIN_TRUST_DAYS`).
- Au démarrage, `useAuth` ne demande le PIN que si le profil en a un **et**
  que l'appareil n'est pas de confiance. `trustDevice` est posé après une
  vérification réussie, une création de profil avec PIN, ou l'ajout d'un PIN
  depuis « Sécurité (PIN) ».
- La confiance est **liée au `user_number`** : un autre profil sur le même
  téléphone doit saisir son propre PIN. `logout()` appelle `forgetDevice()`.
- ⚠️ C'est un compromis explicite : au-delà de 30 jours (ou après une
  déconnexion), le PIN est redemandé. Ne pas le rendre éternel sans rediscuter
  du risque « téléphone perdu ».
- ⚠️ Ce n'est **pas une authentification forte** : le code admin est dans le
  bundle et la RLS est ouverte. Cela empêche une erreur ou une curiosité, pas
  une attaque délibérée. Ne pas le présenter autrement.

### Notifications push (tâche 31)
- **Web Push standard**, sans service tiers : le service worker généré par
  Workbox importe `public/push-handler.js` (`workbox.importScripts`). Ce
  fichier porte les écouteurs `push` et `notificationclick` ; ne pas le
  déplacer hors de `public/`, Workbox le copie à la racine de `dist/`.
- **Un clic sur une notification ferme tout le lot** : les messages s'empilent
  (un tag par message), et ouvrir l'app depuis l'une d'elles appelle
  `registration.getNotifications()` pour fermer les autres. Sinon des
  notifications déjà lues restaient dans le centre.
- **Un abonnement par appareil** (`push_subscriptions`, endpoint unique) et
  **des préférences par personne** (`notification_preferences`). Une ligne de
  préférences absente vaut « tout activé ».
- `src/services/push.ts` ne fait que le navigateur (support, permission,
  abonnement). `usePushNotifications` fait le lien avec la base et expose
  `status` : `unsupported`, `unconfigured`, `needs-install`, `denied`,
  `subscribed`, `available`.
- **iPhone : iOS 16.4+ et application installée sur l'écran d'accueil.**
  Dans Safari, `PushManager` peut exister mais l'abonnement échoue : le hook
  renvoie `needs-install` avant même de demander la permission. Ne pas
  contourner ce garde-fou.
- **La demande de permission part d'un clic** (`NotificationsModal`), jamais
  au chargement : iOS l'exige.
- **Se déconnecter retire l'abonnement de l'appareil** (`UserMenu` appelle
  `disable()` avant `logout()`), sinon le téléphone continuerait à recevoir
  les notifications du profil précédent.
- **Le service worker est désactivé en développement** (`devOptions.enabled:
  false`) : tester le push avec `npm run build && npm run preview`, ou sur le
  déploiement Vercel. En dev, `subscribeToPush` demande de recharger plutôt
  que d'attendre indéfiniment `navigator.serviceWorker.ready`.
- Le webhook Supabase appelle l'Edge Function `send-push` avec l'en-tête
  `x-push-secret`. La fonction utilise la clé de service **uniquement côté
  serveur**, exclut l'auteur du message, respecte la préférence `messages`,
  et supprime les abonnements révoqués (404/410).
- **Rappel du mardi** : la même fonction répond aussi à
  `{ "type": "run_reminder" }`. Elle calcule le mercredi cible (bascule 14h,
  fuseau `Europe/Paris`), ne garde que les appareils des personnes **sans
  ligne `attendances`** pour cette semaine et respecte `run_reminder`. Une
  personne qui a répondu « pas cette semaine » a répondu : elle n'est pas
  relancée.
- ⚠️ **Un `\n` en fin de `VAPID_SUBJECT` fait répondre `403 BadJwtToken`**
  aux serveurs de push (Apple). La fonction nettoie les secrets
  (`cleanSecret`), mais garder chaque valeur sur une seule ligne.
- **Le petit icône Android est le `badge`, pas `icon`.** Android ne garde que
  le **canal alpha** du badge : une icône opaque et colorée donne un carré
  blanc dans la barre d'état. `public/notification-badge.png` est donc une
  silhouette blanche 96×96 sur fond transparent, et `push-handler.js` la
  référence explicitement. Ne pas remettre `pwa-192x192.png` en badge.

#### Déploiement des notifications (dashboard)
1. **SQL** : appliquer `migrations/2026-11-04_tache31_notifications_push.sql`
   dans le SQL Editor, d'abord sur la base de test, puis sur la prod.
2. **Vercel** : ajouter `VITE_VAPID_PUBLIC_KEY` (Settings → Environment
   Variables) puis redéployer. Sans elle, l'écran affiche « non configuré ».
3. **Secrets Supabase** (Edge Functions → Secrets) :
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (ex.
   `mailto:admin@happyrunners.fr`), `PUSH_WEBHOOK_SECRET`.
   Les valeurs générées localement sont dans `backups/vapid-keys.txt`
   (non versionné). **Ne jamais committer la clé privée ni le secret.**
4. **Edge Function** : Dashboard → Edge Functions → Deploy a new function →
   via l'éditeur, nom `send-push`, coller
   `supabase/functions/send-push/index.ts`. **Désactiver la vérification JWT**
   (le webhook ne présente pas de JWT ; l'authentification se fait par
   `x-push-secret`).
5. **Webhook** : Database → Webhooks → Create, table `messages`, événement
   `INSERT`, type HTTP, méthode `POST`, URL
   `https://<ref>.supabase.co/functions/v1/send-push`, en-têtes
   `Content-Type: application/json` et `x-push-secret: <secret>`.
6. **Rappel du mardi** : Integrations → Cron → Create job, nom
   `send-run-reminder`, planification `0 17 * * 2` (mardi 18h Paris l'hiver,
   19h l'été : pg_cron raisonne en UTC). Cible « SQL snippet », car
   `x-push-secret` doit être fourni :

   ```sql
   select net.http_post(
     url := 'https://<ref>.supabase.co/functions/v1/send-push',
     headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'x-push-secret', '<secret>'
     ),
     body := '{"type":"run_reminder"}'::jsonb,
     timeout_milliseconds := 10000
   );
   ```

   Activer l'extension `pg_net` (Database → Extensions) si le job le
   réclame. Un projet gratuit **mis en pause** n'exécute pas ses jobs.
7. **Test** : Android fonctionne depuis le navigateur ; iPhone depuis l'icône
   de l'écran d'accueil uniquement. Le premier envoi peut demander quelques
   secondes (cold start de la fonction). Le rappel se teste sans attendre
   mardi : même appel que le job, avec le corps `{"type":"run_reminder"}`.

#### Résilience de l'abonnement (tâche 33)

Un abonnement Web Push peut mourir sans action de la personne : données de
site évincées, PWA déchargée par iOS, mise à jour du navigateur. La ligne en
base reste alors valide côté service de push, qui répond encore `201` — mais
aucun appareil n'affiche la notification. Deux garde-fous, à ne pas retirer :

- **`pushsubscriptionchange`** dans `public/push-handler.js` : quand le
  navigateur renouvelle l'abonnement, le worker se réabonne et met la base à
  jour (upsert du nouvel endpoint, suppression de l'ancien). Il lit la
  configuration Supabase déposée par `src/services/pushConfigStore.ts` dans
  IndexedDB : un service worker n'a ni `import.meta.env` ni `localStorage`.
- **Resynchronisation à l'ouverture** (`src/services/pushSync.ts`, appelée par
  `usePushNotifications`) : si l'abonnement du navigateur existe, ses clés et
  son propriétaire sont réécrits ; s'il a disparu, il est recréé sans clic
  **uniquement** si la permission est toujours accordée et que cet appareil
  était déjà abonné pour cette personne (`src/services/pushDevice.ts`).

**Pas de bouton de test dans l'interface.** Il a existé (tâche 33) puis a été
retiré : il faisait « pro » de vérifier soi-même, mais un bouton « Tester les
notifications » exposé à tout le monde n'a pas sa place dans un produit fini —
et son appel direct à `send-push` échouait en CORS. La vérification se fait en
conditions réelles : un message envoyé par quelqu'un d'autre, ou le rappel du
mardi. Ne pas le réintroduire.

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
  aux erreurs. Une fois choisi, il est **rempli en gris foncé** (`neutral`) :
  le gris clair se confondait avec le contour violet resté sur « Je viens »,
  on ne voyait pas que la réponse était enregistrée.
- **Un seul titre par bloc** : la carte météo n'a pas de titre (celui de la
  section suffit) ; le tableau de présence n'a **ni titre ni récapitulatif**
  au-dessus ou en dessous — ses trois en-têtes de groupe portent le compte
  (« Présents · 1 »). Ne jamais réintroduire une ligne « 1 présent · 10 en
  attente » : c'était le même chiffre, écrit deux fois.
- **Le tableau « Qui vient ? » montre tout le groupe** — présents, absents et
  sans-réponse. Il ne liste jamais seulement ceux qui ont répondu : une
  personne silencieuse doit rester visible, sinon personne ne peut la relancer.
  La fusion vit dans `presenceRows.ts`, pas dans `Home`.
- **Trois sections, deux présentations** : « Présents » en lignes (avatar
  coloré, nom, pastille du parcours) parce qu'ils ont quelque chose à montrer ;
  « Absents » et « N'ont pas répondu » en puces compactes (avatar gris, nom),
  parce que dix noms identiques ne méritent pas dix lignes. Une section vide
  disparaît. La personne connectée remonte en tête de son groupe.
- **Ordre des sections : présents → absents → sans-réponse.** Les deux réponses
  franches d'abord, le silence ensuite : c'est un état, pas une réponse, et il
  n'a pas à s'intercaler entre les deux. Ne pas remonter les sans-réponse
  au-dessus des absents.
- **Échelle d'espacement : 4 / 8 / 16 px.** Dans une section, 8 px entre
  l'en-tête et le contenu, 16 px entre deux sections. Les en-têtes (pastille de
  couleur) et les avatars des deux listes commencent au **même retrait de
  8 px** : c'est ce qui fait tenir le bloc. Ne pas revenir à `gap-1.5` ni à un
  en-tête collé au bord de la carte.
- **« Sans réponse » est un état neutre, pas une alerte** : gris
  (`text-gray-500`, avatars gris), jamais ambre ni rouge. Dix lignes orange
  volaient la vedette au seul présent. Le vert reste réservé à « vient », le
  rouge aux absents et aux actions destructives.
- **Une seule entrée vers la gestion des parcours** : l'icône de l'en-tête.
  Pas de bouton pleine largeur en bas de page.
- **Cibles tactiles ≥ 44 px** (`min-h-11` dans `Button`) et **aucun texte
  inférieur à 12 px** — seule exception : l'heure des bulles du chat, à 10 px.
- **L'accent `#0077a8`** est le seul bleu portant du texte blanc (contraste
  AA ≈ 5:1). Ne pas revenir à `#009ddc` pour un bouton.

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Oui | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Oui | Supabase anon key (**régénérable** — copier depuis le dashboard si "Invalid API key") |
| `VITE_VAPID_PUBLIC_KEY` | Pour le push | Clé publique VAPID ; sans elle, l'écran Notifications affiche « non configuré » |
| ~~`VITE_OPENWEATHER_API_KEY`~~ | **Supprimé** | Open-Meteo n'a pas besoin de clé |

Secrets **serveur** (Supabase Edge Functions, jamais dans Vercel ni dans le
dépôt) : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
`PUSH_WEBHOOK_SECRET`.

**Base de test** : `.env.test` (non versionné) pointe vers un second projet
Supabase isolé. `npm run dev:test` et `backup.py --env .env.test` l'utilisent.
La prod est réservée aux utilisateurs ; la seule lecture autorisée dessus est
`python3 backup.py save`.

## Database Schema

**Source de vérité : `schema.sql`.** Ce fichier est rejouable tel quel sur une
base vide. Ne jamais décrire le schéma dans la prose ci-dessous : c'est ainsi
que ce document avait fini par annoncer un `participations(local_user_id)`
qui n'existait plus depuis la migration `user_number`.

### Les 8 tables qui comptent
| Table | Clé | Particularité |
|---|---|---|
| `user_profiles` | `user_number` (SEQUENCE) | identifiant **stable**, indépendant du nom |
| `parcours` | `id` uuid | `points` jsonb = tracé GPX |
| `attendances` | `UNIQUE(week_key, user_number)` | `going` \| `skip` |
| `participations` | `UNIQUE(user_number, week_key)` | **un seul parcours par personne et par semaine** |
| `messages` | `id` uuid | fil de discussion, fenêtre glissante de 30 jours |
| `message_reactions` | `(message_id, user_number)` | **une seule réaction par personne** : la clé primaire le garantit |
| `push_subscriptions` | `id` uuid, `endpoint` unique | un abonnement par appareil, supprimé avec le profil |
| `notification_preferences` | `user_number` | un booléen par catégorie ; ligne absente = tout activé |

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

`save` pagine par 1 000 lignes et couvre les **huit tables**, chat et push
compris. `restore` valide le fichier, sauvegarde l'état courant, supprime dans
l'ordre inverse et vérifie les comptes. Il refuse aussi un dump contenant un
vote sans présence `going` (ancien vote orphelin), avant toute suppression. Il
sort en **code 2** tant que le `setval` de `user_number_seq` n'a pas été
exécuté. Tests hors ligne : `python3 -m unittest test_backup.py -v`.

**Sauvegarde planifiée** : `.github/workflows/backup.yml` lance `save` chaque
jour à 3 h UTC et conserve un artefact chiffré 30 jours. Secrets requis :
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BACKUP_PASSPHRASE` (Settings → Secrets
and variables → Actions). Le chiffrement passe par
`openssl enc -aes-256-cbc -pbkdf2` ; la procédure de restauration est dans
`README.md`. Ne jamais committer la phrase de passe. GitHub désactive les
workflows planifiés après 60 jours sans activité sur le dépôt : vérifier de
temps en temps que le job tourne encore.

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
| `src/services/pinTrust.test.ts` | appareil de confiance : 30 jours, autre profil, repère illisible, oubli |
| `src/services/push.test.ts` | support, iOS/standalone, permission, abonnement/désabonnement, réabonnement sans clic |
| `src/services/pushDevice.test.ts` | marqueurs locaux : retrait explicite, profil abonné |
| `src/services/pushConfigStore.test.ts` | configuration partagée avec le service worker, sans IndexedDB |
| `src/services/pushSync.test.ts` | resynchronisation à l'ouverture, recréation d'un abonnement disparu |
| `src/hooks/usePushNotifications.test.tsx` | états de l'écran, activation, préférences, resynchronisation |
| `src/components/NotificationsModal.test.tsx` | catégories, états iPhone/navigateur, fermeture |
| `src/hooks/useAuth.integration.test.tsx` | flux auth complet + partage d'état |
| `src/hooks/useParcoursVotes.test.tsx` | votes hebdo, tri, pendingCount, optimisme |
| `src/hooks/useParcoursVotes.attendance.test.tsx` | un vote sans présence ne compte pas |
| `src/hooks/useAttendance.test.tsx` | réponse optimiste, échec, course avec un chargement déjà parti |
| `src/services/adminCode.test.ts` | verrou admin, ne mémorise rien |
| `src/pages/ParcoursList.admin.test.tsx` | portée du déverrouillage (page + personne) |
| `src/services/schema.test.ts` | `schema.sql` rejouable et à jour |
| `src/services/storage.test.ts` | cache utilisateur local |
| `src/services/gpxParser.test.ts` | XML/JSON GPX, distance, dénivelé, simplification, bounds |
| `src/services/messages.test.ts` | fenêtre 30 j, validation, regroupement par jour, non-lus |
| `src/hooks/useMessages.test.tsx` | polling, envoi optimiste, échec, purge, course polling/envoi |
| `src/hooks/useUnreadMessages.test.tsx` | pastille : première visite, 30 s, retour d'onglet |
| `src/pages/Chat.test.tsx` | lecture ouverte, fil, marquage lu, prénoms en double |
| `src/components/RequireUser.test.tsx` | visiteur redirigé, connecté autorisé, attente du chargement |
| `src/pages/Home.messages.test.tsx` | Messages absent sans identité, présent une fois connecté |
| `src/config/vercelConfig.test.ts` | repli SPA de Vercel : toute route inconnue → `index.html` |
| `src/pages/Admin.test.tsx` | code admin, recherche, réinitialisation et retrait du PIN |
| `src/components/AdminPinResetModal.test.tsx` | validation du PIN, confirmation, retrait, panne |
| `src/test/setup.ts` | mock Supabase global + cleanup |

Ajouter un test pour toute nouvelle logique d'auth ou d'identification.

### Bout en bout (Playwright)

```bash
npm run test:e2e       # 3 scénarios, Chrome local
npm run test:e2e:ui    # mode interface
```

`playwright.config.ts` démarre lui-même `npm run dev:test` sur le port 5175 :
les scénarios tournent **uniquement sur la base de test** (`.env.test`).

- Trois parcours : connexion → présence/vote, envoi d'un message avec réponse
  citée, réaction puis « qui a réagi ».
- Compte dédié **Test E2E** (prénom/nom), créé au premier passage via
  « Passer sans PIN ». Ses messages sont supprimés en fin de scénario ; sa
  présence est remise à « Pas cette semaine ».
- **Un seul worker** : les scénarios partagent la base de test.
- macOS 13 : le Chromium fourni par Playwright ne s'installe pas. On utilise
  `channel: 'chrome'` (Chrome du système). Sur une autre machine, retirer
  cette ligne et lancer `npx playwright install chromium`.
- `vite.config.ts` ignore `test-results/` et `playwright-report/` : sans ça,
  Vite recharge la page quand Playwright écrit une trace, ce qui annule les
  requêtes en cours (le message restait en « Envoi… »).
- La CI ne les lance pas encore : ils écrivent dans la base de test et
  demandent un navigateur.

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
7i. **`injectRegister: false` exige `workbox.skipWaiting` + `clientsClaim`
    explicites** — le plugin ne les ajoute plus tout seul. Sans eux, la
    nouvelle version reste en attente, aucun `controllerchange` n'arrive et
    les onglets ouverts ne se mettent jamais à jour.
7j. **Le chat n'utilise pas Realtime** — polling 5 s visible / 30 s caché.
    Et une réponse de polling partie avant un envoi doit être **ignorée** :
    elle ne contient pas le message optimiste et le ferait disparaître.
7k. **Vercel a besoin d'un repli SPA** (`vercel.json`) — sans lui, ouvrir
    `/messages` ou `/parcours` directement renvoie 404, même si la navigation
    interne fonctionne. Les fichiers statiques sont servis avant la
    réécriture : ne pas restreindre la règle aux seuls assets sans raison.
7l. **Le hash du PIN ne sort jamais du service** — `getProfilesWithPinStatus`
    le convertit en `hasPin`. Ne pas renvoyer `pin_hash` à l'écran admin :
    il n'en a aucun besoin, et un hash affiché finit dans une capture d'écran.
7m. **Le push ne se teste pas en `npm run dev`** — le service worker y est
    désactivé. Utiliser `npm run build && npm run preview` ou Vercel, et
    installer l'app sur l'écran d'accueil pour iPhone (iOS 16.4+). Le webhook
    doit envoyer `x-push-secret`, et la fonction doit être déployée avec la
    vérification JWT désactivée.
7n. **La clé privée VAPID et `PUSH_WEBHOOK_SECRET` ne sortent jamais du
    serveur** — elles vivent dans les secrets Supabase, pas dans `.env`, pas
    dans Vercel, pas dans un commit.
7o. **Un secret VAPID qui finit par `\n` casse tout en silence** — Apple
    répond `403 BadJwtToken`. La fonction nettoie les valeurs, mais un
    copier-coller multi-lignes dans le dashboard reste le piège n° 1 : les
    quatre valeurs tiennent chacune sur une seule ligne.
7p. **Le rappel du mardi ne relance que les sans-réponse** — filtrer sur
    `attendances` pour la semaine cible, pas sur les votes. `pg_cron` est en
    UTC : `0 17 * * 2` = 18h Paris en hiver, 19h en été.
7q. **Le `badge` Android doit être monochrome et transparent** — Android
    n'utilise que son canal alpha. Un PNG opaque (l'icône de l'app) produit
    le carré blanc dans la barre d'état. Utiliser
    `public/notification-badge.png`, jamais `pwa-192x192.png`.
7r. **Les réactions se migrent avant de se déployer** — `getRecentMessages`
    sélectionne `message_reactions(...)`. Si la table n'existe pas encore en
    prod, le chat entier tombe. Appliquer
    `migrations/2026-11-06_tache32_reactions_chat.sql` d'abord sur la base de
    test, puis sur la prod, et seulement ensuite pousser l'interface.
7s. **Un abonnement push peut mourir en silence** — le service de push répond
    encore `201` alors que l'appareil n'affiche plus rien. Ne pas conclure
    « le serveur envoie » sans vérifier l'appareil. Les garde-fous sont
    `pushsubscriptionchange` et la resynchronisation à l'ouverture
    (`pushSync.ts`). Pas de bouton de test dans l'interface : la vérification
    se fait avec un vrai message ou le rappel du mardi.
7t. **La réponse citée se migre avant l'interface** — `getRecentMessages` et
    `sendMessage` lisent les colonnes `reply_to_*`. Appliquer
    `migrations/2026-11-10_tache34_reponse_chat.sql` d'abord sur la base de
    test, puis en prod. La sauvegarde doit aussi restaurer les messages dans
    l'ordre de `created_at` (pas `id`) : une réponse cite toujours un message
    plus ancien, sinon la clé étrangère échoue.
7u. **Playwright écrit dans le projet** — traces, captures et rapports vont
    dans `test-results/` et `playwright-report/`. Sans les exclure du watcher
    Vite (`server.watch.ignored`), le serveur recharge la page en pleine
    action et annule les requêtes en cours. Symptôme : un message reste en
    « Envoi… » alors que la ligne existe en base.
7v. **Une écriture optimiste doit invalider les chargements partis avant**
    (`mutationRef` dans `useAttendance` et `useMessages`). Sinon la réponse
    d'un chargement antérieur réapplique l'ancien état : « Je viens » semble
    ne pas être pris en compte jusqu'au polling suivant.
8. **`npm run lint` + `npm test` + `npm run build` obligatoires** avant de présenter un changement

## Known Issues
- Vulnérabilités npm : 4 restantes, toutes `low`, dans l'outillage de build
  (`workbox-build` → `deepmerge`) — jamais servies aux utilisateurs, aucun
  correctif amont disponible ; `npm audit` pour le détail
- Bundle au-dessus de 500 kB — warning Vite, pas bloquant — `npm run build` pour la taille exacte
- Sécurité du PIN faible par conception (hash client simple, pas d'auth serveur) — acceptable pour un club de collègues, **pas** pour un usage réel
