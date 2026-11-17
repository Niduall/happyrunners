# Feuille de route — HappyRunners

Dernière mise à jour : **16 novembre 2026**

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

`backup.py` couvre désormais les **dix tables** (chat, push et historique
compris), et
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
| **Historique des sorties** | Page `/historique` : 12 mercredis passés, présents, et **une sortie par personne et par semaine** (`weekly_runs`, clé `week_key,user_number`). Chacun déclare son propre parcours (liste ou « autre »), peut le corriger ou le retirer — le retrait reste possible même après la clôture ; déclarer remet la présence à « going ». Une semaine se fige au mercredi suivant 14h : seule la sortie la plus récente reste déclarable et corrigeable, et les cartes figées portent une mention « Semaine clôturée ». Les semaines sans présence ni sortie sont masquées (avec un compteur pour les déplier), sauf la semaine ouverte où l'on vient déclarer. L'accueil rappelle la sortie manquante dès 12h30 le jour du run, et un bouton « Je n'ai pas couru » coupe ce rappel **par personne** (`weekly_run_skips`, la réponse suit la personne d'un appareil à l'autre) ; la modale ne présélectionne rien sans indice. Nom, km et D+ sont figés à la déclaration, les stats personnelles comptent les valeurs connues. Le vote reste un simple indice. Source `manual`, prête pour GPX/Strava. | M | ✅ Livré |

## À faire ensuite

### Priorité 1 — fort impact

| Idée | Détail | Effort |
|---|---|---|
| **Hors ligne réel** | Le README promet « fonctionne hors ligne », mais seule la coquille est précachée. Cacher le dernier état de Home et afficher un bandeau « données du … » quand le réseau manque. | M |
| **GPX pour une sortie « Autre »** | Dans la modale de déclaration, joindre un fichier GPX remplit la distance et le D+ au lieu de les laisser vides : une sortie improvisée compte enfin dans les stats. `gpxParser` existe déjà (XML et JSON Strava) ; il faut passer `source: 'gpx'` jusqu'à `declareWeeklyRun`, qui l'écrit en dur à `manual` aujourd'hui. **Aucune migration** : `weekly_runs.source` (`manual` \| `gpx` \| `strava`), `distance_km` et `elevation_gain_m` existent déjà. À trancher : garder le tracé (`points jsonb`, migration + poids) ou seulement les chiffres — le second suffit pour les stats, le premier ouvre la carte des sorties passées. | S/M |

### Priorité 2 — confort et fiabilité

| Idée | Détail | Effort |
|---|---|---|
| **Palette de réactions beaucoup plus large** | Aujourd'hui 5 emoji fixes (`like`, `love`, `laugh`, `run`, `fire`). Ouvrir un vrai choix, avec catégories et recherche si besoin. Deux contraintes à ne pas oublier : le `CHECK` de `message_reactions.reaction` doit être élargi par une migration (sinon l'insertion est refusée), et les pastilles doivent rester lisibles quand un message en accumule beaucoup. La clé primaire garde « une seule réaction par personne et par message ». | M |
| **Message épinglé** | Un message important (parcours du jour, consignes) reste en haut du fil. | S/M |
| **Ligue et badges** | S'appuyer sur les sorties déclarées (une par personne et par mercredi) pour un classement et des badges. À cadrer : critères (régularité, km, D+, série), périodes, égalités. | M |
| **Annulation météo** | État « Sortie annulée » avec motif, visible sur Home et notifié aux personnes qui viennent. | M |

### Priorité 3 — selon le besoin réel

| Idée | Détail | Effort |
|---|---|---|
| **Covoiturage** | « Je peux emmener N personnes » / « Je cherche une place » pour la sortie de la semaine. | M |
| **Export CSV de la saison** | Présences et parcours, pour le club. | S |
| **Fusion des doublons de profil** | Console admin : repérer deux profils créés pour la même personne. Opération sensible (votes, réactions, présences à reporter). | M |

## Exploré plus tard — montres et plateformes

Idées notées le 16 novembre 2026. Aucune n'est engagée : elles demandent des
comptes développeur, des secrets serveur ou une application native, donc un
autre projet que cette PWA.

| Piste | Ce qu'il faudrait | Réalité à connaître |
|---|---|---|
| **Import GPX / FIT depuis une montre** | Un simple champ fichier dans la déclaration de sortie. GPX est déjà lu (`gpxParser`) ; le FIT de Garmin demanderait un parseur dédié. | La plus simple, et elle règle 90 % du besoin : la personne exporte depuis sa montre et dépose le fichier. Aucun compte tiers, aucun secret. À faire avant toute intégration. |
| **Strava** | OAuth (client id + **secret**, donc une Edge Function) puis l'API Activities, avec des limites de débit. | Le secret ne peut pas vivre dans le bundle. Acceptable, mais c'est le premier vrai bout de serveur du projet. Le dépôt manuel du GPX exporté par Strava donne le même résultat pour beaucoup moins. |
| **Apple Health** | Aucune API web : HealthKit exige une app native iOS. Le chemin réaliste est un raccourci iOS qui exporte la sortie et partage un fichier à l'app. | Sur iPhone, « exporter vers HappyRunners » via Raccourcis est faisable ; une intégration directe ne l'est pas dans une PWA. |
| **Garmin** | Garmin Connect API réservée au programme partenaire (approbation, conditions). | À oublier côté API sauf besoin réel. L'export GPX/FIT manuel reste la voie. |
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
- « Je n'ai pas couru » **par personne** (`weekly_run_skips`) : la réponse suit
  la personne d'un téléphone à l'autre, et déclarer une sortie l'efface.
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
