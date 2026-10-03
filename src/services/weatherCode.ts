/**
 * Codes météo WMO (norme internationale) utilisés par Open-Meteo.
 *
 * Doc : https://open-meteo.com/en/docs#weather_variable_documentation
 *
 * Rappel : le run est toujours à 12h30, donc la météo du run est toujours
 * en plein jour. La variante nuit ne concerne que la météo de secours.
 */

export interface WeatherCodeInfo {
  /** Emoji représentatif */
  emoji: string
  /** Libellé français */
  label: string
  /** Classes Tailwind du cercle de fond + du texte */
  bg: string
  text: string
}

const INFO: Record<number, WeatherCodeInfo> = {
  0: { emoji: '☀️', label: 'Ensoleillé', bg: 'bg-amber-100', text: 'text-amber-600' },
  1: { emoji: '🌤️', label: 'Peu nuageux', bg: 'bg-sky-100', text: 'text-sky-600' },
  2: { emoji: '⛅', label: 'Partiellement nuageux', bg: 'bg-sky-100', text: 'text-sky-600' },
  3: { emoji: '☁️', label: 'Nuageux', bg: 'bg-gray-100', text: 'text-gray-600' },
  45: { emoji: '🌫️', label: 'Brouillard', bg: 'bg-gray-200', text: 'text-gray-600' },
  48: { emoji: '🌫️', label: 'Brouillard givrant', bg: 'bg-gray-200', text: 'text-gray-600' },

  51: { emoji: '🌦️', label: 'Bruine légère', bg: 'bg-slate-100', text: 'text-slate-600' },
  53: { emoji: '🌦️', label: 'Bruine', bg: 'bg-slate-100', text: 'text-slate-600' },
  55: { emoji: '🌧️', label: 'Bruine dense', bg: 'bg-slate-200', text: 'text-slate-700' },

  56: { emoji: '🌧️', label: 'Bruine verglaçante', bg: 'bg-slate-200', text: 'text-slate-700' },
  57: { emoji: '🌧️', label: 'Bruine verglaçante dense', bg: 'bg-slate-200', text: 'text-slate-700' },

  61: { emoji: '🌧️', label: 'Pluie faible', bg: 'bg-blue-100', text: 'text-blue-600' },
  63: { emoji: '🌧️', label: 'Pluie', bg: 'bg-blue-100', text: 'text-blue-600' },
  65: { emoji: '🌧️', label: 'Pluie forte', bg: 'bg-blue-200', text: 'text-blue-700' },
  66: { emoji: '🌧️', label: 'Pluie verglaçante', bg: 'bg-blue-200', text: 'text-blue-700' },
  67: { emoji: '🌧️', label: 'Pluie verglaçante forte', bg: 'bg-blue-200', text: 'text-blue-700' },

  71: { emoji: '🌨️', label: 'Neige légère', bg: 'bg-indigo-100', text: 'text-indigo-600' },
  73: { emoji: '❄️', label: 'Neige', bg: 'bg-indigo-100', text: 'text-indigo-600' },
  75: { emoji: '❄️', label: 'Neige forte', bg: 'bg-indigo-200', text: 'text-indigo-700' },
  77: { emoji: '🌨️', label: 'Grains de neige', bg: 'bg-indigo-100', text: 'text-indigo-600' },

  80: { emoji: '🌦️', label: 'Averses légères', bg: 'bg-sky-100', text: 'text-sky-600' },
  81: { emoji: '🌦️', label: 'Averses', bg: 'bg-sky-200', text: 'text-sky-700' },
  82: { emoji: '⛈️', label: 'Averses violentes', bg: 'bg-sky-200', text: 'text-sky-700' },

  85: { emoji: '🌨️', label: 'Averses de neige', bg: 'bg-indigo-100', text: 'text-indigo-600' },
  86: { emoji: '❄️', label: 'Averses de neige fortes', bg: 'bg-indigo-200', text: 'text-indigo-700' },

  95: { emoji: '⛈️', label: 'Orage', bg: 'bg-purple-100', text: 'text-purple-600' },
  96: { emoji: '⛈️', label: 'Orage avec grêle', bg: 'bg-purple-200', text: 'text-purple-700' },
  99: { emoji: '⛈️', label: 'Orage avec grêle forte', bg: 'bg-purple-200', text: 'text-purple-700' },
}

/** Repli pour un code inconnu */
const UNKNOWN: WeatherCodeInfo = {
  emoji: '🌡️',
  label: 'Inconnu',
  bg: 'bg-gray-100',
  text: 'text-gray-600',
}

/** Nuit : le ciel dégagé devient une lune */
const NIGHT_OVERRIDE: Partial<Record<number, WeatherCodeInfo>> = {
  0: { emoji: '🌙', label: 'Nuit claire', bg: 'bg-indigo-100', text: 'text-indigo-600' },
  1: { emoji: '🌙', label: 'Peu nuageux', bg: 'bg-indigo-100', text: 'text-indigo-600' },
  2: { emoji: '☁️', label: 'Partiellement nuageux', bg: 'bg-slate-200', text: 'text-slate-600' },
}

export function getWeatherCodeInfo(code: number | undefined | null, isDay = true): WeatherCodeInfo {
  if (code == null) return UNKNOWN
  if (!isDay) {
    const night = NIGHT_OVERRIDE[code]
    if (night) return night
  }
  return INFO[code] ?? UNKNOWN
}

/** Juste l'emoji, pratique pour les usages simples */
export function weatherCodeToEmoji(code: number | undefined | null, isDay = true): string {
  return getWeatherCodeInfo(code, isDay).emoji
}
