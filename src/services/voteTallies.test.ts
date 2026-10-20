import { describe, it, expect } from 'vitest'
import { goingSet, summarizeVotes } from './voteTallies'
import type { WeekVote } from './supabaseService'

const vote = (
  parcoursId: string,
  userNumber: number,
  status: 'yes' | 'no' = 'yes'
): WeekVote => ({ parcoursId, userNumber, status })

describe('goingSet', () => {
  it('ne garde que les personnes qui viennent', () => {
    const going = goingSet([
      { userNumber: 1, status: 'going' },
      { userNumber: 2, status: 'skip' },
      { userNumber: 3, status: 'going' },
    ])

    expect([...going]).toEqual([1, 3])
  })

  it('renvoie un ensemble vide si personne ne vient', () => {
    expect(goingSet([]).size).toBe(0)
    expect(goingSet([{ userNumber: 1, status: 'skip' }]).size).toBe(0)
  })
})

describe('summarizeVotes', () => {
  it('compte les yes et les no des présents', () => {
    const { tallies } = summarizeVotes(
      [vote('p1', 1), vote('p1', 2, 'no'), vote('p2', 1)],
      new Set([1, 2])
    )

    expect(tallies).toEqual({
      p1: { parcoursId: 'p1', yes: 1, no: 1 },
      p2: { parcoursId: 'p2', yes: 1, no: 0 },
    })
  })

  it('ignore les votes des absents et des personnes sans réponse', () => {
    const { tallies, choices } = summarizeVotes(
      [vote('p1', 1), vote('p1', 2), vote('p2', 3)],
      new Set([1])
    )

    expect(tallies).toEqual({ p1: { parcoursId: 'p1', yes: 1, no: 0 } })
    expect(choices).toEqual({ 1: 'p1' })
  })

  it('retient un seul choix par personne', () => {
    const { choices } = summarizeVotes(
      [vote('p1', 1), vote('p2', 1)],
      new Set([1])
    )

    expect(choices).toEqual({ 1: 'p2' })
  })

  it('compte tous les votes quand les présences sont inconnues', () => {
    const { tallies, choices } = summarizeVotes(
      [vote('p1', 1), vote('p1', 2, 'no'), vote('p2', 3)],
      null
    )

    expect(tallies).toEqual({
      p1: { parcoursId: 'p1', yes: 1, no: 1 },
      p2: { parcoursId: 'p2', yes: 1, no: 0 },
    })
    expect(choices).toEqual({ 1: 'p1', 2: 'p1', 3: 'p2' })
  })

  it('ignore les lignes sans personne ou sans parcours', () => {
    const { tallies, choices } = summarizeVotes(
      [
        { parcoursId: 'p1', userNumber: 0, status: 'yes' },
        { parcoursId: '', userNumber: 1, status: 'yes' },
        vote('p2', 2),
      ],
      new Set([1, 2])
    )

    expect(tallies).toEqual({ p2: { parcoursId: 'p2', yes: 1, no: 0 } })
    expect(choices).toEqual({ 2: 'p2' })
  })

  it('renvoie des compteurs vides sans vote', () => {
    expect(summarizeVotes([], new Set([1]))).toEqual({ tallies: {}, choices: {} })
  })
})
