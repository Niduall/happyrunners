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
  const requestIdRef = useRef(0)

  const { weekKey, weekLabel } = useTargetWednesday()
  // Clé courante, lue au moment où la réponse arrive : une requête partie
  // avant la bascule de 14h ne doit jamais réécrire l'affichage de la
  // semaine suivante, même si elle résout après elle.
  const weekKeyRef = useRef(weekKey)
  weekKeyRef.current = weekKey

  const loadAll = useCallback(
    async (opts?: { keepError?: boolean }) => {
      if (!user?.id) return

      const requestId = ++requestIdRef.current
      const requestedWeekKey = weekKey
      const isStale = () =>
        requestId !== requestIdRef.current || requestedWeekKey !== weekKeyRef.current

      try {
        const list = await getWeekAttendances(requestedWeekKey)
        if (isStale()) return
        setAttendees(list)
        setMyStatusState(list.find((a) => a.userNumber === user.id)?.status ?? null)
        if (!opts?.keepError) setError(null)
      } catch (err) {
        if (isStale()) return
        console.error('[ATTENDANCE] Erreur chargement:', err)
        setError(err instanceof Error ? err.message : 'Erreur chargement des réponses')
      } finally {
        if (!isStale()) setLoading(false)
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
      const actionWeekKey = weekKey
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
        await setAttendance({ weekKey: actionWeekKey, userNumber: user.id, status })

        // "Pas aujourd'hui" retire aussi le choix de parcours : quelqu'un
        // qui ne vient pas ne doit pas peser sur le vote d'un parcours.
        // Le trigger DB le fait déjà ; cet appel est un filet de sécurité.
        if (status === 'skip') {
          try {
            await deleteWeekVote(user.id, actionWeekKey)
          } catch (err) {
            // La présence est enregistrée : ne pas revenir en arrière ni
            // afficher une erreur. Le vote reste filtré par la présence.
            console.warn('[ATTENDANCE] Vote non retiré par le client:', err)
          }
        }

        // L'action a été lancée avant la bascule : elle concerne l'ancienne
        // semaine et ne doit pas toucher l'interface de la nouvelle.
        if (actionWeekKey !== weekKeyRef.current) return
        setError(null)
      } catch (err) {
        console.error('[ATTENDANCE] Erreur:', err)
        if (actionWeekKey !== weekKeyRef.current) return
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
      // On ne propose un parcours qu'à qui a confirmé sa présence.
      // ⚠️ `myStatus === null` (pas encore répondu) doit être exclu : sinon
      // un nouveau membre peut voter avant de répondre, et son vote pèse
      // alors qu'il n'a jamais dit qu'il venait.
      showParcours: myStatus === 'going',
    }),
    [myStatus, attendees, weekKey, weekLabel, loading, authLoading, saving, error, setMyStatus, statusOf]
  )
}
