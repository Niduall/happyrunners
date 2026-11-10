# Feuille de route — HappyRunners

Dernière mise à jour : **10 novembre 2026**

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

`backup.py` couvre désormais les **huit tables** (chat et push compris), et
`.github/workflows/backup.yml` sauvegarde la prod chaque jour à 3 h UTC dans
un artefact chiffré conservé 30 jours.

## À faire ensuite

### Priorité 1 — fort impact

| Idée | Détail | Effort |
|---|---|---|
| **Historique des sorties** | Page `/historique` : mercredis passés, présents, parcours retenu, distance/D+. Stats perso : nombre de sorties, km cumulés, série en cours. Les données existent déjà (`attendances`, `participations` par `week_key`) et `weeksBetween` est prévu pour ça. | M |
| **Répondre à un message** | Réponse citée dans le chat (`reply_to_id`), avec un aperçu du message d’origine. Utile dès qu’on est nombreux. Petite migration. | M |
| **Hors ligne réel** | Le README promet « fonctionne hors ligne », mais seule la coquille est précachée. Cacher le dernier état de Home et afficher un bandeau « données du … » quand le réseau manque. | M |

### Priorité 2 — confort et fiabilité

| Idée | Détail | Effort |
|---|---|---|
| **Message épinglé** | Un message important (parcours du jour, consignes) reste en haut du fil. | S/M |
| **Annulation météo** | État « Sortie annulée » avec motif, visible sur Home et notifié aux personnes qui viennent. | M |
| **Tests de bout en bout** | Trois scénarios Playwright : connexion → présence/vote, envoi dans le chat, réaction + « qui a réagi ». Couvre les régressions visuelles et de déploiement. | M |

### Priorité 3 — selon le besoin réel

| Idée | Détail | Effort |
|---|---|---|
| **Covoiturage** | « Je peux emmener N personnes » / « Je cherche une place » pour la sortie de la semaine. | M |
| **Export CSV de la saison** | Présences et parcours, pour le club. | S |
| **Fusion des doublons de profil** | Console admin : repérer deux profils créés pour la même personne. Opération sensible (votes, réactions, présences à reporter). | M |

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

- Chat sur 30 jours glissants, envoi optimiste, non-lus, polling 5 s / 30 s.
- Réactions à palette fixe et **liste des personnes ayant réagi** au clic sur
  une pastille.
- Contraste du texte secondaire en `gray-500` (WCAG AA) sur les heures, aides
  et états d’envoi.
- Pages secondaires (`Admin`, `Chat`, `ParcoursList`) chargées à la demande.
- Fichier d’agenda `.ics` de la sortie du mercredi et partage de l’app.
- Notifications push résilientes, préférences par personne, rappel du mardi.
- PIN optionnel, appareil de confiance, console de réinitialisation admin.
- Météo Open-Meteo 16 jours, bandeau « autour de 12h30 ».
- Présences, votes multi-parcours, tableau « Qui vient ? ».
- Import GPX (XML et JSON Strava), carte Leaflet chargée à la demande.
- Sauvegarde/restauration `backup.py`, CI lint + tests + build.

## Lexique

- **Route à la demande** : le code d’une page n’est téléchargé qu’au moment où
  on ouvre cette page, au lieu d’être dans le fichier JavaScript chargé au
  démarrage.
- **S / M / L** : quelques heures / une à deux séances / plusieurs séances.
