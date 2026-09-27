# Running Club 🏃‍♂️

Application PWA pour organiser les sorties running du mercredi midi avec les collègues.

## Fonctionnalités

- 📅 **Prochain mercredi** : Météo + parcours proposé + participation
- 🌤️ **Météo** : Via OpenWeatherMap (gratuit, 1000 req/jour)
- 🗺️ **Parcours** : Import GPX (export Strava) + affichage carte Leaflet
- ✅ **Participation** : Boutons "Je participe / Je ne participe pas" (stocké localement)
- 📱 **PWA** : Installable sur iOS/Android, fonctionne offline
- 💾 **Pas de backend** : Tout en LocalStorage pour commencer

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS v4
- Leaflet + OpenStreetMap (carte gratuite)
- gpxparser (parse GPX)
- date-fns (dates)
- lucide-react (icônes)
- vite-plugin-pwa (PWA)

## Installation

```bash
npm install
```

## Configuration météo

1. Créez un compte gratuit sur [OpenWeatherMap](https://openweathermap.org/api)
2. Récupérez votre API Key
3. Copiez `.env.example` vers `.env` et ajoutez votre clé :
   ```env
   VITE_OPENWEATHER_API_KEY=votre_cle
   VITE_DEFAULT_LAT=48.8566  # Votre latitude
   VITE_DEFAULT_LON=2.3522   # Votre longitude
   ```

## Développement

```bash
npm run dev
```

## Build production

```bash
npm run build
```

Le dossier `dist/` est prêt à déployer sur **Vercel**, **Netlify** ou **GitHub Pages** (gratuit).

## Déploiement PWA

1. Déployez sur Vercel/Netlify (HTTPS automatique)
2. Sur mobile : ouvrez l'URL → menu navigateur → "Ajouter à l'écran d'accueil"
3. L'app s'installe comme une app native

## Utilisation

1. **Page d'accueil** : Voit le prochain mercredi, la météo, le parcours, et vote
2. **Page Parcours** : Liste tous les parcours, ajoute/en supprime via upload GPX
3. **Export Strava** : Sur strava.com → Mes activités → menu → "Exporter GPX"

## Structure

```
src/
├── components/     # UI components (MapView, WeatherCard, ParticipationBtn, ParcoursCard)
├── pages/          # Home, ParcoursList
├── services/       # weatherApi, gpxParser, storage
├── hooks/          # useWeather, useParticipation
├── types/          # TypeScript interfaces
├── lib/            # utils (cn)
├── App.tsx         # Routes
└── main.tsx        # Entry point
```

## Prochaines étapes (v2)

- [ ] Backend simple (Supabase/Firebase) pour synchroniser les participations
- [ ] Partage de lien vers le parcours
- [ ] Notifications push (mercredi matin)
- [ ] Historique des sorties
- [ ] Statistiques (km cumulés, participation)
- [ ] Authentification simple (nom seulement)