import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import type { AttendanceStatus, Attendee } from '../services/supabaseService'
import { Card, CardContent } from './ui/Card'

export interface PresenceRow {
  userNumber: number
  firstName: string
  lastName: string
  attendance: AttendanceStatus | null
  parcoursName: string | null
}

interface ParticipantsTableProps {
  rows: PresenceRow[]
  currentUserNumber?: number
  weekLabel: string
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

/** Tri : présents → en attente → absents, alphabétique à l'intérieur de chaque groupe */
export function sortPresenceRows(rows: PresenceRow[]): PresenceRow[] {
  const rank = (a: PresenceRow): number => {
    if (a.attendance === 'going') return 0
    if (a.attendance === null) return 1
    return 2 // skip
  }

  return [...rows].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'fr')
  })
}

function StatusBadge({ status }: { status: AttendanceStatus | null }) {
  if (status === 'going') {
    return (
      <span className="inline-flex items-center gap-1.5 text-green-700">
        <CheckCircle2 className="w-4 h-4" />
        vient
      </span>
    )
  }
  if (status === 'skip') {
    return (
      <span className="inline-flex items-center gap-1.5 text-red-500">
        <XCircle className="w-4 h-4" />
        absent
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-amber-600">
      <Clock className="w-4 h-4" />
      en attente
    </span>
  )
}

export function ParticipantsTable({ rows, currentUserNumber, weekLabel }: ParticipantsTableProps) {
  const sorted = sortPresenceRows(rows)

  const going = sorted.filter((r) => r.attendance === 'going').length
  const pending = sorted.filter((r) => r.attendance === null).length
  const skip = sorted.filter((r) => r.attendance === 'skip').length

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
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h3 className="font-semibold text-gray-900">Présence</h3>
          <p className="text-sm text-gray-500">{weekLabel}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left font-medium text-gray-700 py-2 pr-4">Participant</th>
                <th className="text-left font-medium text-gray-700 py-2 pr-4">Statut</th>
                <th className="text-left font-medium text-gray-700 py-2">Parcours</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const isMe = row.userNumber === currentUserNumber
                const isAbsent = row.attendance === 'skip'
                return (
                  <tr
                    key={row.userNumber}
                    className={`border-b border-gray-100 last:border-0 ${
                      isAbsent ? 'opacity-50' : ''
                    } ${isMe ? 'bg-primary/5' : ''}`}
                  >
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${
                            isAbsent ? 'bg-gray-200 text-gray-500' : colorFor(row.userNumber)
                          }`}
                        >
                          {initials(row.firstName, row.lastName)}
                        </div>
                        <span className="whitespace-nowrap">
                          {row.firstName} {row.lastName}
                          {isMe && <span className="ml-1 text-xs text-primary">(vous)</span>}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <StatusBadge status={row.attendance} />
                    </td>
                    <td className="py-2 text-gray-700">
                      {row.parcoursName || <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Résumé */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-green-700">{going} {going > 1 ? 'viennent' : 'vient'}</span>
          {pending > 0 && <span className="text-amber-600">{pending} en attente</span>}
          {skip > 0 && <span className="text-red-500">{skip} {skip > 1 ? 'absents' : 'absent'}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
