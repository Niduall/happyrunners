import type { PresenceRow } from '../types'
import { Card, CardContent } from './ui/Card'

// Le type de ligne est défini dans `types/index.ts` (partagé avec le service
// qui fusionne annuaire et réponses) ; on le ré-exporte pour ne pas casser
// les imports existants.
export type { PresenceRow }

interface ParticipantsTableProps {
  rows: PresenceRow[]
  currentUserNumber?: number
}

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
]

const initials = (firstName: string, lastName: string): string => {
  const a = (firstName[0] || '').toUpperCase()
  const b = (lastName[0] || '').toUpperCase()
  return `${a}${b}` || '?'
}

/** Couleur stable dérivée du user_number → chaque personne garde sa couleur */
const colorFor = (userNumber: number): string =>
  AVATAR_COLORS[userNumber % AVATAR_COLORS.length]

/**
 * Tri : présents → absents → sans-réponse, alphabétique à l'intérieur de
 * chaque groupe. La personne connectée remonte en tête de son groupe : sans
 * ça, quelqu'un qui n'a pas répondu se cherche au milieu de dix noms.
 */
export function sortPresenceRows(
  rows: PresenceRow[],
  currentUserNumber?: number
): PresenceRow[] {
  const rank = (a: PresenceRow): number => {
    if (a.status === 'going') return 0
    if (a.status === 'skip') return 1
    return 2 // sans réponse
  }

  return [...rows].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb

    if (currentUserNumber !== undefined) {
      const aIsMe = a.userNumber === currentUserNumber
      const bIsMe = b.userNumber === currentUserNumber
      if (aIsMe !== bIsMe) return aIsMe ? -1 : 1
    }

    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'fr')
  })
}

/** Pastille du parcours choisi — discrète, elle ne doit pas concurrencer le nom */
function ParcoursPill({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="max-w-[50%] truncate rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
    >
      {name}
    </span>
  )
}

function Avatar({
  row,
  size = 'md',
  muted = false,
}: {
  row: PresenceRow
  size?: 'sm' | 'md'
  muted?: boolean
}) {
  const dimension = size === 'md' ? 'w-7 h-7 text-xs' : 'w-5 h-5 text-[10px]'
  const tone = muted ? 'bg-gray-100 text-gray-500' : colorFor(row.userNumber)

  return (
    <span
      aria-hidden="true"
      className={`${dimension} rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${tone}`}
    >
      {initials(row.firstName, row.lastName)}
    </span>
  )
}

function MeMarker({ isMe }: { isMe: boolean }) {
  return isMe ? <span className="ml-1 text-xs font-normal text-primary">(vous)</span> : null
}

/**
 * Les présents gardent une ligne complète : ils ont choisi un parcours, et
 * c'est l'information qu'on vient chercher.
 */
function PresentList({ rows, currentUserNumber }: ParticipantsTableProps) {
  return (
    <ul className="space-y-1">
      {rows.map((row) => {
        const isMe = row.userNumber === currentUserNumber
        return (
          <li
            key={row.userNumber}
            className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2 ${
              isMe ? 'bg-primary/5' : ''
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Avatar row={row} />
              <span className="truncate text-gray-900">
                {row.firstName} {row.lastName}
                <MeMarker isMe={isMe} />
              </span>
            </span>
            {row.parcoursName ? (
              <ParcoursPill name={row.parcoursName} />
            ) : (
              <span className="text-sm text-gray-500">—</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Les autres n'ont pas de parcours à montrer : une puce compacte suffit.
 * Dix noms tiennent ainsi en quelques lignes au lieu de dix lignes de tableau.
 */
function NameChips({ rows, currentUserNumber }: ParticipantsTableProps) {
  return (
    <ul className="flex flex-wrap gap-2">
      {rows.map((row) => {
        const isMe = row.userNumber === currentUserNumber
        return (
          <li
            key={row.userNumber}
            className={`flex items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 ${
              isMe ? 'bg-primary/5 ring-1 ring-primary/20' : 'bg-gray-50'
            }`}
          >
            <Avatar row={row} size="sm" muted />
            <span className="text-sm text-gray-500">
              {row.firstName} {row.lastName}
              <MeMarker isMe={isMe} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}

interface Group {
  key: 'going' | 'pending' | 'skip'
  label: string
  dot: string
  rows: PresenceRow[]
}

/** Trois groupes, dans l'ordre de lecture : présents, absents, sans-réponse. */
function groupRows(rows: PresenceRow[]): Group[] {
  const going = rows.filter((r) => r.status === 'going')
  const pending = rows.filter((r) => r.status === null)
  const skip = rows.filter((r) => r.status === 'skip')

  return (
    [
      { key: 'going', label: 'Présents', dot: 'bg-green-500', rows: going },
      { key: 'skip', label: 'Absents', dot: 'bg-red-300', rows: skip },
      { key: 'pending', label: 'N’ont pas répondu', dot: 'bg-gray-300', rows: pending },
    ] as Group[]
  ).filter((group) => group.rows.length > 0)
}

export function ParticipantsTable({ rows, currentUserNumber }: ParticipantsTableProps) {
  const sorted = sortPresenceRows(rows, currentUserNumber)
  const groups = groupRows(sorted)

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-gray-500">Personne n'a encore répondu. Soyez le premier !</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`presence-${group.key}`}>
              <h3
                id={`presence-${group.key}`}
                className="mb-2 flex items-center gap-2 pl-2 text-sm font-semibold text-gray-700"
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full flex-shrink-0 ${group.dot}`}
                />
                {group.label}
                <span className="font-normal text-gray-500">· {group.rows.length}</span>
              </h3>

              {group.key === 'going' ? (
                <PresentList rows={group.rows} currentUserNumber={currentUserNumber} />
              ) : (
                <NameChips rows={group.rows} currentUserNumber={currentUserNumber} />
              )}
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
