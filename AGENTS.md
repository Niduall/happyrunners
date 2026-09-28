# AGENTS.md - Running Club App

## Project Overview
PWA for organizing Wednesday lunch runs with colleagues. React 18 + TypeScript + Vite + Tailwind v4 + Leaflet + Supabase (optional).

## Key Commands
```bash
npm run dev        # Dev server
npm run build      # TypeScript check + Vite build (outputs to dist/)
npm run preview    # Preview production build
```

## Build & Deploy
- **Build**: `npm run build` → outputs to `dist/`
- **Deploy**: Push to GitHub → Vercel auto-deploys (connected to GitHub)
- **Env vars on Vercel**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OPENWEATHER_API_KEY`

## Architecture
- **SPA**: React 18 + React Router (client-side routing)
- **PWA**: vite-plugin-pwa with autoUpdate, service worker
- **State**: LocalStorage only (no backend) - user profile, parcours, participations
- **Auth**: Simple firstName/lastName stored in localStorage (no email/password)
- **Polling**: 30s intervals for real-time updates (parcours + participations) - replaces Supabase Realtime on free tier

## Key Files
| File | Purpose |
|------|---------|
| `src/hooks/useAuth.ts` | LocalStorage auth (firstName/lastName) |
| `src/hooks/useParcours.ts` | Parcours CRUD + 30s polling |
| `src/hooks/useParticipation.ts` | Participation votes + 30s polling |
| `src/services/gpxParser.ts` | GPX parsing (Strava export format) |
| `src/services/weatherApi.ts` | OpenWeatherMap integration |
| `src/services/storage.ts` | LocalStorage wrappers |
| `src/services/weatherApi.ts` | Weather API (OpenWeatherMap) |
| `src/components/Auth.tsx` | Login form + UserMenu |

## Critical Implementation Details

### Auth Flow
- **Login**: `window.location.href = '/'` (full page reload to rehydrate auth state)
- **Logout**: Same, forces page reload to clear React state
- **State**: Stored in `localStorage` as `running_user` (id, firstName, lastName, name)

### GPX Parsing (src/services/gpxParser.ts)
- Handles Strava export format (flat array of 3000+ points)
- Detects format: flat points, segments, or track.segments
- Returns `{ distance_km, elevation_gain_m, points[] }`

### Polling (30s intervals)
- `useParcours.ts`: `setInterval(loadParcours, 30000)`
- `useParticipation.ts`: `setInterval(loadCounts + loadMyVote, 30000)`
- Replaces Supabase Realtime (not reliable on free tier)

### Auth Flow Quirks
- **Login**: `window.location.href = '/'` forces full reload to rehydrate auth
- **Logout**: Same - `window.location.href = '/'` in `useAuth.ts`
- **Never use `navigate('/')`** for auth transitions - causes stale state

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Optional | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Optional | Supabase anon key |
| `VITE_OPENWEATHER_API_KEY` | Optional | OpenWeatherMap API key |
| `VITE_DEFAULT_LAT` | Default: 48.6833 | Default latitude (Tomblaine) |
| `VITE_DEFAULT_LON` | Default: 6.2167 | Default longitude (Tomblaine) |

## Common Issues & Fixes
| Issue | Fix |
|-------|-----|
| Login/logout doesn't redirect | Use `window.location.href = '/'` not `navigate('/')` |
| GPX import fails | Check Strava export format - parser handles flat points, segments, track.segments |
| WebSocket errors | Expected on free Supabase tier - polling handles real-time |
| Vercel 404 on refresh | Add `vercel.json` with rewrite rules for SPA |

## Testing
- No formal test suite yet
- Manual testing via `npm run dev` and `npm run build`
- Test in navigation privée (avoids cache issues)

## Deployment
- **Vercel**: Connected to GitHub repo `Niduall/happyrunners`
- Auto-deploys on push to `main`
- Environment variables in Vercel Dashboard → Settings → Environment Variables

## Common Pitfalls to Avoid
1. **Never use `navigate('/')` for auth transitions** - use `window.location.href = '/'` to force full page reload and rehydrate auth state
2. **GPX parser** expects Strava export format (flat points array)
3. **Supabase Realtime** is unreliable on free tier - rely on 30s polling
3. **Vercel cache** - use navigation privée for testing
4. **Supabase RLS** must allow insert for authenticated users on parcours/participations