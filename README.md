# HappyRunners 🏃‍♂️

[![CI](https://github.com/Niduall/happyrunners/actions/workflows/ci.yml/badge.svg)](https://github.com/Niduall/happyrunners/actions/workflows/ci.yml)

Application PWA pour organiser les sorties running du mercredi midi avec les collègues.

## Fonctionnalités

- 📅 **Prochain mercredi** : météo à 12h30, parcours proposés, vote
- 🌤️ **Météo** : Open-Meteo — 16 jours de prévision, **aucune clé API requise**
- 🗺️ **Parcours** : import GPX (Strava inclus) + carte Leaflet
- ✅ **Présence** : « Je viens » / « Pas aujourd'hui » par semaine
- 🗳️ **Vote** : un parcours par personne et par semaine, égalité signalée
- 🔐 **PIN** : 4 chiffres, optionnel, gérable depuis le menu du profil
- 📱 **PWA** : installable iOS/Android, fonctionne hors ligne

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Leaflet + OpenStreetMap
- Supabase (base seule — pas d'authentification serveur)
- lucide-react · vite-plugin-pwa

## Installation

```bash
npm install
```

## Configuration

Copiez `.env.example` vers `.env` :

```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre_cle_anon
VITE_VAPID_PUBLIC_KEY=votre_cle_publique_vapid
```

La clé anon est **régénérable** depuis le dashboard Supabase. Aucune clé
météo : Open-Meteo n'en demande pas. La clé VAPID **publique** sert aux
notifications push ; la clé privée et le secret du webhook restent dans les
secrets Supabase (voir `AGENTS.md`, section Notifications).

## Notifications

Chaque personne peut activer, appareil par appareil, deux catégories :
**nouveaux messages** et **rappel du mardi soir**. Sur iPhone, iOS 16.4
minimum et l'application doit être installée sur l'écran d'accueil ; Android
fonctionne aussi dans le navigateur. Le détail du déploiement (migration,
Edge Function, webhook) est dans `AGENTS.md`.

## Base de données

`schema.sql` est la **source de vérité** de la structure : tables, séquence
`user_number`, contraintes, clés étrangères, index et politiques RLS. Il est
rejouable tel quel sur une base vide. `src/services/schema.test.ts` vérifie que
le **fichier** reste cohérent ; il ne prouve pas que la base en production lui
correspond (voir le commentaire en tête de ce test).

Pour reconstruire une base neuve : jouer `schema.sql`, puis
`python3 backup.py restore <fichier>`.

### Sauvegarde

```bash
python3 backup.py save                  # exporte la prod dans backups/<date>.json
python3 backup.py list                  # backups disponibles, sans réseau
python3 backup.py restore <fichier>     # ⚠️ REMPLACE le contenu des tables
```

Options utiles :

```bash
python3 backup.py save --env .env.test          # cible la base de test
python3 backup.py restore <fichier> --dry-run   # affiche le plan, n'écrit rien
python3 backup.py restore <fichier> --allow-empty
```

`save` pagine par 1 000 lignes : aucune table n'est tronquée. Il couvre les
huit tables, y compris le chat (`messages`, `message_reactions`) et le push
(`push_subscriptions`, `notification_preferences`). `restore` valide le
fichier avant de supprimer quoi que ce soit (tables, comptes, clés
étrangères), prend automatiquement une sauvegarde
`happyrunners-pre-restore-<date>.json`, puis vérifie les comptes après
réécriture. Il refuse aussi un dump contenant un vote sans présence `going`
(ancien vote orphelin) : la vérification a lieu avant toute suppression.

La séquence `user_number_seq` n'est pas accessible via l'API REST : à la fin,
le script affiche la commande SQL à exécuter et **sort avec le code 2**
(« RESTAURATION INCOMPLÈTE »). Tant qu'elle n'est pas passée, la prochaine
inscription peut échouer.

Les backups contiennent les noms et les votes des membres : ils sont ignorés
par git (`backups/`) et ne doivent pas circuler.

### Sauvegarde automatique

`.github/workflows/backup.yml` exécute `backup.py save` **chaque jour à 3 h
UTC** (4 h ou 5 h à Paris selon la saison), et peut aussi être lancé à la main
depuis l’onglet **Actions** du dépôt.

Le fichier est **chiffré** (AES-256-CBC + PBKDF2, via `openssl`) puis conservé
comme artefact GitHub pendant **30 jours**. Le job échoue si la sauvegarde est
vide ou si le déchiffrement ne redonne pas exactement le fichier d’origine.

Secrets à créer dans **Settings → Secrets and variables → Actions** :

| Secret | Valeur |
|---|---|
| `SUPABASE_URL` | URL du projet de prod |
| `SUPABASE_ANON_KEY` | clé anon de la prod (lecture seule, RLS ouverte) |
| `BACKUP_PASSPHRASE` | phrase de passe du chiffrement, à conserver hors du dépôt |

Pour restaurer un artefact : le télécharger depuis l’onglet Actions, puis

```bash
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in happyrunners-<date>.json.enc -out happyrunners-<date>.json \
  -pass env:BACKUP_PASSPHRASE
python3 backup.py restore happyrunners-<date>.json
```

Deux limites à connaître : GitHub **désactive les workflows planifiés** après
60 jours sans activité sur le dépôt, et les artefacts expirent au bout de
30 jours. Pour une conservation plus longue, télécharger régulièrement
l’artefact ou passer à un stockage dédié.

## Code administrateur

La **suppression** et la **modification** d'un parcours demandent un code
administrateur. L'**import GPX reste libre** : chaque membre peut ajouter
ses propres tracés.

| | |
|---|---|
| Où le définir | `.env` en local, Vercel → Settings → Environment Variables en prod |
| Variable | `VITE_ADMIN_CODE` |
| Durée | Le temps de rester sur la page de gestion des parcours. En la quittant, ou au changement d'utilisateur, le code est redemandé |
| Code oublié | Changer la variable dans Vercel et redéployer. Aucune base à ouvrir |

Si `VITE_ADMIN_CODE` est absente, aucun cadenas n'apparaît et tout reste
accessible : un déploiement ne bloque donc jamais l'administrateur par surprise.

### Ce que ce code n'est pas

Il vit dans une variable d'environnement, donc **il est lisible dans le bundle
JavaScript**. Il empêche la suppression accidentelle ou curieuse en un clic ;
il n'empêche pas quelqu'un d'écrire un `fetch` à la main avec la clé anon.

Un vrai verrouillage demande une authentification serveur
(Supabase Auth + politiques RLS restreintes).

## Sécurité

Les politiques RLS sont **ouvertes** (`USING (true)`) et l'authentification est
uniquement côté client (nom + PIN hashé). Conséquence : quiconque possède l'URL
et la clé anon peut lire et écrire toutes les tables.

C'est une **dissuasion**, pas une sécurité. Adapté à un club entre
collègues ; à revoir avant toute mise en ligne publique.

## Développement

```bash
npm run dev        # pointe vers la prod (.env)
npm run dev:test   # pointe vers la base de test (.env.test)
```

La base de test est un second projet Supabase, isolé. `.env.test` n'est pas
versionné. Toute manipulation de test (application, `restore`, données) doit
passer par `npm run dev:test` ou `backup.py --env .env.test` ; la prod est
réservée aux utilisateurs. Seule lecture autorisée sur la prod :
`python3 backup.py save`.

## Tests

```bash
npm test           # unitaires + intégration (Vitest)
npm run test:e2e   # bout en bout (Playwright, base de test)
```

Les tests E2E démarrent leur propre serveur `dev:test` et utilisent un compte
dédié « Test E2E » : ils ne touchent jamais la prod. Ils nécessitent Chrome
(`channel: 'chrome'` sur macOS 13, où le Chromium de Playwright ne s'installe
pas).

## Build production

```bash
npm run build
```

Le dossier `dist/` est prêt à déployer sur **Vercel** ou **Netlify**.
GitHub Pages n'est pas pris en charge : le build n'a pas de `base` et la PWA est
en `scope: '/'`.

## Déploiement PWA

1. Déployez sur Vercel/Netlify (HTTPS automatique)
2. Sur mobile : ouvrez l'URL → menu navigateur → "Ajouter à l'écran d'accueil"
3. L'app s'installe comme une app native

## Utilisation

1. **Identification** : prénom + nom → crée le profil, avec PIN optionnel
2. **Accueil** : météo du mercredi 12h30, parcours proposés, vote
3. **Gérer les parcours** : import GPX, suppression confirmée
4. **Export Strava** : strava.com → Mes activités → menu → « Exporter GPX »

## Structure

```
schema.sql          # structure de la base — SOURCE DE VÉRITÉ
backup.py           # export / restauration
ARCHITECTURE.md     # machine à états, flux, points d'attention
src/
├── components/     # Auth, UserMenu, SecurityModal, WeatherCard, ParticipantsTable…
├── pages/          # Home, ParcoursList
├── hooks/          # useAuth, useParcours, useParcoursVotes, useAttendance…
├── services/       # supabaseService, weatherApi, gpxParser, storage, weekKey
├── types/          # interfaces TypeScript
└── lib/            # utils (cn)
```

## Historique des sorties

Pas encore implémenté. L'app ne conserve qu'une semaine active : elle bascule
sur le mercredi suivant à 14h (voir `weekKey.ts`).