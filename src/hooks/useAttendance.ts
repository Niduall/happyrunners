import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  getWeekAttendances,
  setAttendance,
  type AttendanceStatus,
  type Attendee,
} from '../services/supabaseService'
import { getCurrentWeekKey, formatWeekLabel } from '../services/weekKey'
import { useAuth } from './useAuth'

const POLL_INTERVAL_MS = 30000

export type { Attendee }

export interface AttendanceState {
  /** Ma réponse pour cette semaine : null = pas encore répondu */
  myStatus: AttendanceStatus | null
  /** Toutes les réponses de la semaine */
  attendees: Attendee[]
  weekKey: string
  weekLabel: string
  loading: boolean
  saving: boolean
  error: string | null
  setMyStatus: (status: AttendanceStatus) => Promise<void>
  statusOf: (localUserId: string) => AttendanceStatus | null
  /** true si je viens (ou n'ai pas encore répondu) → on propose les parcours */
  showParcours: boolean
}

export function useAttendance(): AttendanceState {
  const { user, loading: authLoading } = useAuth()
  const [myStatus, setMyStatusState] = useState<AttendanceStatus | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const weekKey = useMemo(() => getCurrentWeekKey(), [])
  const weekLabel = useMemo(() => formatWeekLabel(weekKey), [weekKey])

  const loadAll = useCallback(async (opts?: { keepError?: boolean }) => {
    if (!user?.id) return
    try {
      const list = await getWeekAttendances(weekKey)
      setAttendees(list)
      setMyStatusState(list.find((a) => a.localUserId === user.id)?.status ?? null)
      if (!opts?.keepError) setError(null)
    } catch (err) {
      console.error('[ATTENDANCE] Erreur chargement:', err)
      setError(err instanceof Error ? err.message : 'Erreur chargement des réponses')
    } finally {
      setLoading(false)
    }
  }, [user?.id, weekKey])

  useEffect(() => {
    if (authLoading) return
    if (!user?.id) {
      setMyStatusState(null)
      setAttendees([])
      setLoading(false)
      return
    }

    setLoading(true)
    setMyStatusState(null)
    setAttendees([])

    void loadAll()

    pollingRef.current = setInterval(() => {
      void loadAll()
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [authLoading, user?.id, loadAll])

  const setMyStatus = useCallback(
    async (status: AttendanceStatus) => {
      if (!user?.id) {
        console.error('[ATTENDANCE] Réponse ignorée : non connecté')
        setError('Connecte-toi pour répondre')
        return
      }

      const previous = myStatus
      setMyStatusState(status) // optimiste
      setAttendees((prev) => {
        const rest = prev.filter((a) => a.localUserId !== user.id)
        return [
          ...rest,
          {
            localUserId: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            status,
          },
        ]
      })
      setSaving(true)

      try {
        await setAttendance({
          weekKey,
          localUserId: user.id,
          status,
          identity: { firstName: user.firstName, lastName: user.lastName },
        })
      } catch (err) {
        console.error('[ATTENDANCE] Erreur:', err)
        setError(err instanceof Error ? err.message : 'Erreur lors de la réponse')
        setMyStatusState(previous)
        await loadAll({ keepError: true })
      } finally {
        setSaving(false)
      }
    },
    [user, myStatus, weekKey, loadAll]
  )

  const statusOf = useCallback(
    (localUserId: string): AttendanceStatus | null =>
      attendees.find((a) => a.localUserId === localUserId)?.status ?? null,
    [attendees]
  )

  return {
    myStatus,
    attendees,
    weekKey,
    weekLabel,
    loading: loading || authLoading,
    saving,
    error,
    setMyStatus,
    statusOf,
    // "skip" masque les préférences de parcours
    showParcours: myStatus !== 'skip',
  }
}
