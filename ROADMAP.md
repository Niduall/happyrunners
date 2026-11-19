# Feuille de route — HappyRunners

Dernière mise à jour : **18 novembre 2026**

Cette feuille de route garde les idées d’amélioration et les fonctionnalités
envisagées, avec leur priorité et leur coût. Elle ne remplace pas `AGENTS.md`
(règles techniques) ni `ARCHITECTURE.md` (fonctionnement).

## Règles de travail

- **Une tâche à la fois** : on termine, on vérifie, on montre le diff.
- `npm run lint`, `npm test` et `npm run build` avant toute présentation.
- **Aucun `git push` sans accord explicite.**
- Développement et tests uniquement sur la **base de test** ; la prod est en
  lecture seule (sauf validation explicite).
- Migration d’abord sur la base de test, puis en prod, **avant** l’interface.

## Livré — Lot rapide (8 novembre 2026)

| Tâche | Pourquoi | Effort | État |
|---|---|---|---|
| **Contraste du texte secondaire** | Les heures et aides en `text-gray-400` à 12 px sont à ~2,7:1 sur blanc, sous WCAG AA (4,5:1). L’app s’utilise dehors, en plein soleil. | S | ✅ Livré |
| **Routes à la demande** | `Admin`, `ParcoursList` et `Chat` sont dans le bundle initial (631 Ko, 178 Ko gzip). Les charger seulement à la navigation accélère le premier écran. | S | ✅ Livré |
| **Agenda + partage** | Bouton `.ics` / Google Calendar pour le mercredi 12h30, et « Partager l’app ». Adoption et rappel sans dépendre du push. | S | ✅ Livré |

## Livré — Sauvegardes planifiées (9 novembre 2026)

| Tâche | Pourquoi | Effort | État |
|---|---|---|---|
| **Sauvegardes planifiées** | Job quotidien qui exécute `backup.py save` et conserve un artefact chiffré, au lieu de dépendre d’une action manuelle. | M | ✅ Livré |

`backup.py` couvre désormais les **douze tables** (chat, push, historique et
montre compris), et
`.github/workflows/backup.yml` sauvegarde la prod chaque jour à 3 h UTC dans
un artefact chiffré conservé 30 jours.

## Livré — Chat (10 novembre 2026)

| Tâche | Pourquoi | Effort | État |
|---|---|---|---|
| **Répondre à un message** | Réponse citée dans le chat (`reply_to_id`), avec un aperçu du message d’origine. Utile dès qu’on est nombreux. L’aperçu est un instantané (`reply_to_body`, `reply_to_user_number`) qui survit à la purge des 30 jours. | M | ✅ Livré |

## Livré — Tests de bout en bout (12 novembre 2026)

| Tâche | Pourquoi | Effort | État |
|---|---|---|---|
| **Tests de bout en bout** | Trois scénarios Playwright sur la base de test : connexion → présence/vote, envoi d’un message avec réponse citée, réaction puis « qui a réagi ». Ils ont déjà révélé une course entre « Je viens » et le chargement initial, corrigée. | M | ✅ Livré |

## Livré — Historique des sorties (16 novembre 2026)

| Tâche | Pourquoi | Effort | État |
|---|---|---|---|
| **Historique des sorties** | Page `/historique` : 12 mercredis passés, présents, et **une sortie par personne et par semaine** (`weekly_runs`, clé `week_key,user_number`). Chacun déclare son propre parcours (liste ou « autre »), peut le corriger ou le retirer — le retrait reste possible même après la clôture ; déclarer remet la présence à « going ». Une semaine se fige au mercredi suivant 14h : seule la sortie la plus récente reste déclarable et corrigeable, et les cartes figées portent une mention « Semaine clôturée ». Les semaines sans présence ni sortie sont masquées (avec un compteur pour les déplier), sauf la semaine ouverte où l'on vient déclarer. L'accueil rappelle la sortie manquante dès 12h30 le jour du run, et un bouton « Je n'ai pas couru » coupe ce rappel **par personne** (`weekly_run_skips`, la réponse suit la personne d'un appareil à l'autre) ; la modale ne présélectionne rien sans indice. Nom, km et D+ sont figés à la déclaration, les stats personnelles comptent les valeurs connues. Le vote reste un simple indice. Source `manual` ou `gpx` selon que les chiffres ont été saisis ou lus dans un fichier ; `strava` reste à venir. | M | ✅ Livré |

## Livré — Montre et applications (18 novembre 2026)

| Tâche | Pourquoi | Effort | État |
|---|---|---|---|
| **Le téléphone pousse ses séances** | Une application de santé du téléphone (Health Connect Webhook sur Android, Health Webhook ou un Raccourci sur iPhone) poste les séances d'entraînement sur l'Edge Function `ingest`, avec une adresse personnelle. La fonction dépose une proposition `pending` dans `import_proposals` ; **elle n'écrit jamais dans le classement**. L'historique affiche la proposition de la semaine encore ouverte, et « Valider » déclare la sortie (`source = 'health'`, distance en km, D+ inconnu) ; « Ignorer » l'écarte. Gratuit côté projet, sans clé à générer chez Garmin : le jeton est créé par l'app, stocké **haché** en base (`device_links.token_hash`) et en clair uniquement sur le téléphone. Aucun agrégateur, aucun compte développeur ; les applications payantes éventuelles sont à la charge de chaque personne. **Seules les sorties du mercredi sont proposées** (`weekKeyForRunDate`) : c'est le jour du groupe, et l'historique ne compte qu'une sortie par personne et par semaine ; une sortie du mercredi reste sur ce mercredi même après 14h. | M | ✅ Livré |

À vérifier sur un vrai téléphone Android : Garmin Connect écrit-il bien des
**séances d'entraînement** typées dans Health Connect (Android 14+), et pas
seulement des échantillons de distance ? Le chemin iPhone (Garmin Connect →
Apple Santé → Health Webhook) est confirmé pour les « Workouts ».

## À faire ensuite

### Priorité 1 — fort impact

| Idée | Détail | Effort |
|---|---|---|
| **Hors ligne réel** | Le README promet « fonctionne hors ligne », mais seule la coquille est précachée. Cacher le dernier état de Home et afficher un bandeau « données du … » quand le réseau manque. | M |

### Priorité 2 — confort et fiabilité

| Idée | Détail | Effort |
|---|---|---|
| **Palette de réactions beaucoup plus large** | Aujourd'hui 5 emoji fixes (`like`, `love`, `laugh`, `run`, `fire`). Ouvrir un vrai choix, avec catégories et recherche si besoin. Deux contraintes à ne pas oublier : le `CHECK` de `message_reactions.reaction` doit être élargi par une migration (sinon l'insertion est refusée), et les pastilles doivent rester lisibles quand un message en accumule beaucoup. La clé primaire garde « une seule réaction par personne et par message ». | M |
| **Notifications qui restent dans le centre** | Signalé le 18 novembre 2026 : cliquer sur une notification n'efface pas les autres. `public/push-handler.js` appelle pourtant `getNotifications()` puis `close()` sur chacune. À vérifier sur un vrai téléphone : worker encore ancien dans l'app installée (`skipWaiting` ne s'applique qu'après fermeture des onglets), notifications émises par une autre inscription de service worker, ou plateforme qui refuse la fermeture (iOS). Piste de repli : un `tag` commun à tout le groupe, ou un `tag` par conversation au lieu d'un par message. | S |
| **Message épinglé** | Un message important (parcours du jour, consignes) reste en haut du fil. | S/M |
| **Ligue et badges** | S'appuyer sur les sorties déclarées (une par personne et par mercredi) pour un classement et des badges. À cadrer : critères (régularité, km, D+, série), périodes, égalités. | M |
| **Tracé des sorties « autre »** | Aujourd'hui le GPX joint ne garde que les chiffres : `weekly_runs` n'a pas de colonne `points`. Stocker le tracé ouvrirait la carte des sorties passées, au prix d'une migration et de quelques dizaines de Ko par sortie. À décider quand la carte servira vraiment. | M |
| **Annulation météo** | État « Sortie annulée » avec motif, visible sur Home et notifié aux personnes qui viennent. | M |

### Priorité 3 — selon le besoin réel

| Idée | Détail | Effort |
|---|---|---|
| **Covoiturage** | « Je peux emmener N personnes » / « Je cherche une place » pour la sortie de la semaine. | M |
| **Export CSV de la saison** | Présences et parcours, pour le club. | S |
| **Fusion des doublons de profil** | Console admin : repérer deux profils créés pour la même personne. Opération sensible (votes, réactions, présences à reporter). | M |

## Exploré plus tard — montres et plateformes

Idées notées le 16 novembre 2026, revues le 17 et le 18 novembre 2026. La voie
retenue — le téléphone pousse vers l'Edge Function `ingest` — est **livrée**
(voir plus haut). Les autres pistes restent écartées pour les raisons
ci-dessous : elles demandent des comptes développeur, des secrets serveur ou
une application native, donc un autre projet que cette PWA.

| Piste | Ce qu'il faudrait | Réalité à connaître |
|---|---|---|
| **Import GPX / FIT depuis une montre** | Un simple champ fichier dans la déclaration de sortie. GPX est déjà lu (`gpxParser`) ; le FIT de Garmin demanderait un parseur dédié. | La plus simple, et elle règle 90 % du besoin : la personne exporte depuis sa montre et dépose le fichier. Aucun compte tiers, aucun secret. Le GPX d'une sortie « autre » est **livré** ; il reste le FIT. |
| **Strava comme passerelle** | OAuth standard (client id + **secret** dans une Edge Function), scope `activity:read`, une requête par personne et par semaine. Garmin Connect synchronise déjà ses activités vers Strava. | Envisagée puis **écartée** : l'app API est payante (~80 $/an) et sa politique réserve les données au propriétaire (2.3, 6.1) tout en interdisant les proxys et agrégateurs (5.16). Incompatible avec un historique visible par le groupe. |
| **Apple Health** | Aucune API web : HealthKit exige une app native iOS. Le chemin réaliste est une application de santé qui poste les séances vers HappyRunners. | **Livré par le téléphone** : Garmin Connect → Apple Santé → Health Webhook (ou un Raccourci) poste sur `ingest`. Une intégration directe dans la PWA reste impossible : elle demanderait une app native. |
| **Garmin Personal API** | Depuis 2026, chaque personne peut créer sa **propre** clé dans Garmin Connect Web (Réglages → Personal API Token), échangée contre un jeton de 24 h. Endpoints activités et téléchargement du fichier. | Faisable techniquement, déconseillé ici : la clé donne aussi accès au sommeil, à la fréquence cardiaque et au poids ; elle **expire en 30 à 365 jours** (renouvellement manuel) ; Garmin précise qu'elle n'est pas prévue pour une application servant plusieurs personnes. Et la stocker dans une base à RLS ouverte serait pire que le PIN. |
| **Garmin Business API** | Programme partenaire : société, dossier, approbation, OAuth multi-utilisateurs. | Surdimensionné pour un groupe de collègues, et l'ouverture aux nouveaux dossiers a été suspendue puis rouverte. À ne pas viser. |
| **Application sur montre** | watchOS ou Wear OS : une app native, donc Swift/Kotlin, un compte développeur Apple (99 $/an) et une revalidation. | Une PWA ne tourne pas sur une montre. C'est un second produit, pas une tâche de cette feuille de route. |

## Écarté volontairement

- **Indicateur de frappe et accusés de lecture** : bruit et charge pour un
  groupe de collègues.
- **Photos dans le chat** : stockage, modération et confidentialité pour un
  gain limité.
- **Realtime** : le polling 5 s suffit, le plan gratuit est instable (déjà
  documenté dans `AGENTS.md`).
- **Plusieurs emoji par personne et par message** : la clé primaire
  `message_reactions(message_id, user_number)` porte la règle « une seule
  réaction par personne ».
- **Sécurité forte** : RLS ouverte et authentification client assumées pour un
  club entre collègues. À revoir seulement si l’app dépasse ce cercle.

## Déjà livré (ne pas reproposer)

- Historique `/historique` : une sortie par personne et par mercredi, correction
  et retrait, semaines vides masquées, semaine clôturée annoncée.
- **GPX d'une sortie « autre »** : le fichier remplit la distance et le D+
  (`source = 'gpx'`), les chiffres seuls sont gardés. Aucune migration.
- « Je n'ai pas couru » **par personne** (`weekly_run_skips`) : la réponse suit
  la personne d'un téléphone à l'autre, et déclarer une sortie l'efface.
- **Montre et applications** : le téléphone poste ses séances sur l'Edge
  Function `ingest` avec une adresse personnelle ; la proposition attend une
  validation dans `/historique` et n'écrit jamais seule dans le classement.
  Jeton stocké **haché** en base, en clair uniquement sur le téléphone.
- Chat sur 30 jours glissants, envoi optimiste, non-lus, polling 5 s / 30 s.
- Réactions à palette fixe et **liste des personnes ayant réagi** au clic sur
  une pastille.
- Contraste du texte secondaire en `gray-500` (WCAG AA) sur les heures, aides
  et états d’envoi.
- Pages secondaires (`Admin`, `Chat`, `ParcoursList`) chargées à la demande.
- Fichier d’agenda `.ics` de la sortie du mercredi et partage de l’app.
- Notifications push résilientes, préférences par personne, rappel du mardi.
- Tests E2E Playwright (connexion/vote, chat + réponse citée, réactions), sur la
  base de test uniquement.
- PIN optionnel, appareil de confiance, console de réinitialisation admin.
- Météo Open-Meteo 16 jours, bandeau « autour de 12h30 ».
- Sous-titre « Prévision à 12h30 » remonté à 16 px gris 700 : il porte
  l'information, il n'est plus un texte secondaire discret.
- Présences, votes multi-parcours, tableau « Qui vient ? ».
- Import GPX (XML et JSON Strava), carte Leaflet chargée à la demande.
- Sauvegarde/restauration `backup.py`, CI lint + tests + build.

## Lexique

- **Route à la demande** : le code d’une page n’est téléchargé qu’au moment où
  on ouvre cette page, au lieu d’être dans le fichier JavaScript chargé au
  démarrage.
- **S / M / L** : quelques heures / une à deux séances / plusieurs séances.
