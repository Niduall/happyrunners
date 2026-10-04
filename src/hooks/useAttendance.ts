import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  getWeekAttendances,
  setAttendance,
  deleteWeekVote,
  type AttendanceStatus,
  type Attendee,
} from '../services/supabaseService'
import { useTargetWednesday } from './useTargetWednesday'
import { useAuth } from './useAuth'

const POLL_INTERVAL_MS = 30000

export type { Attendee }

export interface AttendanceState {
  /** Ma réponse pour cette semaine : null = pas encore répondu */
  myStatus: AttendanceStatus | null
  /** Toutes les réponses de la semaine (avec les noms) */
  attendees: Attendee[]
  weekKey: string
  weekLabel: string
  loading: boolean
  saving: boolean
  error: string | null
  setMyStatus: (status: AttendanceStatus) => Promise<void>
  statusOf: (userNumber: number) => AttendanceStatus | null
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

  const { weekKey, weekLabel } = useTargetWednesday()

  const loadAll = useCallback(
    async (opts?: { keepError?: boolean }) => {
      if (!user?.id) return
      try {
        const list = await getWeekAttendances(weekKey)
        setAttendees(list)
        setMyStatusState(list.find((a) => a.userNumber === user.id)?.status ?? null)
        if (!opts?.keepError) setError(null)
      } catch (err) {
        console.error('[ATTENDANCE] Erreur chargement:', err)
        setError(err instanceof Error ? err.message : 'Erreur chargement des réponses')
      } finally {
        setLoading(false)
      }
    },
    [user?.id, weekKey]
  )

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
      // Optimiste : la ligne est remplacée, pas dupliquée
      setMyStatusState(status)
      setAttendees((prev) => [
        ...prev.filter((a) => a.userNumber !== user.id),
        {
          userNumber: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          status,
        },
      ])
      setSaving(true)

      try {
        await setAttendance({ weekKey, userNumber: user.id, status })

        // "Pas aujourd'hui" retire aussi le choix de parcours : quelqu'un
        // qui ne vient pas ne doit pas peser sur le vote d'un parcours.
        if (status === 'skip') {
          await deleteWeekVote(user.id, weekKey)
        }
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
    (userNumber: number): AttendanceStatus | null =>
      attendees.find((a) => a.userNumber === userNumber)?.status ?? null,
    [attendees]
  )

  return useMemo(
    () => ({
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
    }),
    [myStatus, attendees, weekKey, weekLabel, loading, authLoading, saving, error, setMyStatus, statusOf]
  )
}
