import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAX_MESSAGE_LENGTH,
  MESSAGE_RETENTION_DAYS,
  MESSAGES_LAST_READ_KEY,
  countUnread,
  dayLabel,
  formatMessageTime,
  groupMessagesByDay,
  isValidMessageBody,
  nextReaction,
  normalizeMessageBody,
  readLastRead,
  retentionCutoff,
  summarizeReactions,
  withReaction,
  writeLastRead,
  REACTION_EMOJI,
  REACTION_KEYS,
} from './messages'
import type { Message, MessageReaction } from '../types/supabase'

const NOW = new Date('2026-11-02T12:00:00.000Z')

function message(
  id: string,
  createdAt: string,
  userNumber = 1,
  body = `message ${id}`
): Message {
  return { id, user_number: userNumber, body, created_at: createdAt }
}

describe('fenêtre de rétention', () => {
  it('place la borne à 30 jours en arrière', () => {
    // Octobre a 31 jours : 2 novembre − 30 jours = 3 octobre.
    expect(retentionCutoff(NOW)).toBe('2026-10-03T12:00:00.000Z')
    expect(MESSAGE_RETENTION_DAYS).toBe(30)
  })

  it('renvoie une date ISO comparable à celle de la base', () => {
    const cutoff = retentionCutoff(NOW)
    expect(cutoff).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('normalizeMessageBody', () => {
  it('retire les espaces de début et de fin', () => {
    expect(normalizeMessageBody('   salut   ')).toBe('salut')
  })

  it('convertit les fins de ligne Windows', () => {
    expect(normalizeMessageBody('a\r\nb')).toBe('a\nb')
  })

  it('garde un saut de ligne simple (Maj+Entrée)', () => {
    expect(normalizeMessageBody('ligne 1\nligne 2')).toBe('ligne 1\nligne 2')
  })

  it('ramène les suites de sauts de ligne à un seul blanc', () => {
    expect(normalizeMessageBody('a\n\n\n\n\nb')).toBe('a\n\nb')
  })
})

describe('isValidMessageBody', () => {
  it('refuse un message vide ou fait d’espaces', () => {
    expect(isValidMessageBody('')).toBe(false)
    expect(isValidMessageBody('   \n  ')).toBe(false)
  })

  it('accepte exactement la limite de la base', () => {
    expect(isValidMessageBody('a'.repeat(MAX_MESSAGE_LENGTH))).toBe(true)
    expect(isValidMessageBody('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe(false)
    expect(MAX_MESSAGE_LENGTH).toBe(500)
  })

  it('mesure après nettoyage', () => {
    // 500 caractères utiles, entourés d'espaces : valide une fois nettoyé.
    expect(isValidMessageBody(`   ${'a'.repeat(MAX_MESSAGE_LENGTH)}   `)).toBe(true)
  })
})

describe('groupMessagesByDay', () => {
  const messages = [
    message('m3', '2026-11-02T10:00:00.000Z'),
    message('m2', '2026-11-01T20:00:00.000Z'),
    message('m1', '2026-10-28T12:00:00.000Z'),
  ]

  it('regroupe par jour, du plus ancien au plus récent', () => {
    const days = groupMessagesByDay(messages, new Date('2026-11-02T12:00:00'))

    expect(days.map((day) => day.label)).toEqual([
      'Mercredi 28 octobre',
      'Hier',
      'Aujourd’hui',
    ])
    expect(days.map((day) => day.messages.map((m) => m.id))).toEqual([
      ['m1'],
      ['m2'],
      ['m3'],
    ])
  })

  it('donne une clé stable réutilisable comme clé React', () => {
    const days = groupMessagesByDay(messages, new Date('2026-11-02T12:00:00'))
    expect(days.map((day) => day.key)).toEqual([
      '2026-10-28',
      '2026-11-01',
      '2026-11-02',
    ])
  })

  it('ne touche pas à la liste d’origine', () => {
    const original = [...messages]
    groupMessagesByDay(messages, new Date('2026-11-02T12:00:00'))
    expect(messages).toEqual(original)
  })

  it('renvoie une liste vide sans message', () => {
    expect(groupMessagesByDay([], NOW)).toEqual([])
  })
})

describe('dayLabel', () => {
  it('nomme aujourd’hui et hier', () => {
    expect(dayLabel(new Date('2026-11-02T08:00:00'), NOW)).toBe('Aujourd’hui')
    expect(dayLabel(new Date('2026-11-01T23:00:00'), NOW)).toBe('Hier')
  })

  it('écrit le jour et la date pour plus ancien', () => {
    expect(dayLabel(new Date('2026-10-28T12:00:00'), NOW)).toBe(
      'Mercredi 28 octobre'
    )
  })
})

describe('formatMessageTime', () => {
  it('affiche l’heure sur 24 h', () => {
    // Heure locale sans fuseau : le test ne dépend pas du fuseau de la machine.
    expect(formatMessageTime('2026-11-02T09:05:00')).toBe('09:05')
    expect(formatMessageTime('2026-11-02T21:30:00')).toBe('21:30')
  })
})

describe('countUnread', () => {
  const lastRead = '2026-11-02T10:00:00.000Z'

  it('ne compte rien à la première visite', () => {
    // Sans dernière lecture, 30 jours de messages ne sont pas « non lus ».
    expect(countUnread([message('m1', '2026-11-02T11:00:00.000Z')], null, 1)).toBe(0)
  })

  it('compte les messages des autres arrivés après la lecture', () => {
    const messages = [
      message('old', '2026-11-02T09:00:00.000Z', 2),
      message('new', '2026-11-02T11:00:00.000Z', 2),
    ]
    expect(countUnread(messages, lastRead, 1)).toBe(1)
  })

  it('ne compte jamais ses propres messages', () => {
    const messages = [message('mine', '2026-11-02T11:00:00.000Z', 1)]
    expect(countUnread(messages, lastRead, 1)).toBe(0)
  })

  it('ne compte pas un message à la seconde exacte de la lecture', () => {
    expect(countUnread([message('edge', lastRead, 2)], lastRead, 1)).toBe(0)
  })
})

describe('dernière lecture', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('se souvient de la dernière lecture', () => {
    writeLastRead('2026-11-02T10:00:00.000Z')
    expect(localStorage.getItem(MESSAGES_LAST_READ_KEY)).toBe(
      '2026-11-02T10:00:00.000Z'
    )
    expect(readLastRead()).toBe('2026-11-02T10:00:00.000Z')
  })

  it('renvoie null sans valeur enregistrée', () => {
    expect(readLastRead()).toBeNull()
  })
})

describe('réactions', () => {
  it('résume les réactions dans l’ordre de la palette', () => {
    const reactions: MessageReaction[] = [
      { user_number: 1, reaction: 'fire' },
      { user_number: 2, reaction: 'like' },
      { user_number: 3, reaction: 'like' },
    ]

    expect(summarizeReactions(reactions, 2)).toEqual([
      {
        key: 'like',
        emoji: '👍',
        label: 'J’aime',
        count: 2,
        mine: true,
        userNumbers: [2, 3],
      },
      {
        key: 'fire',
        emoji: '🔥',
        label: 'Bravo',
        count: 1,
        mine: false,
        userNumbers: [1],
      },
    ])
  })

  it('trie les auteurs par numéro pour une liste stable', () => {
    const reactions: MessageReaction[] = [
      { user_number: 9, reaction: 'love' },
      { user_number: 3, reaction: 'love' },
      { user_number: 7, reaction: 'love' },
    ]

    expect(summarizeReactions(reactions, null)[0].userNumbers).toEqual([3, 7, 9])
  })

  it('ne renvoie aucune pastille sans réaction', () => {
    expect(summarizeReactions([], 1)).toEqual([])
    expect(summarizeReactions(undefined, 1)).toEqual([])
  })

  it('ne signale « la mienne » que pour la personne connectée', () => {
    const reactions: MessageReaction[] = [{ user_number: 2, reaction: 'love' }]

    expect(summarizeReactions(reactions, 1)[0].mine).toBe(false)
    expect(summarizeReactions(reactions, 2)[0].mine).toBe(true)
    // Visiteur non identifié : aucune réaction n'est la sienne.
    expect(summarizeReactions(reactions, null)[0].mine).toBe(false)
  })

  it('expose une palette fixe de cinq emoji', () => {
    expect(REACTION_KEYS).toHaveLength(5)
    for (const key of REACTION_KEYS) {
      expect(REACTION_EMOJI[key]).toBeTruthy()
    }
  })

  it('bascule : un autre emoji remplace, le même retire', () => {
    expect(nextReaction(undefined, 'like')).toBe('like')
    expect(nextReaction('like', 'love')).toBe('love')
    expect(nextReaction('like', 'like')).toBeNull()
  })

  it('applique la réaction sans toucher aux autres messages ni aux champs locaux', () => {
    const messages: Message[] = [
      {
        ...message('m1', '2026-11-02T10:00:00.000Z'),
        reactions: [
          { user_number: 1, reaction: 'like' },
          { user_number: 2, reaction: 'like' },
        ],
      },
      message('m2', '2026-11-02T10:05:00.000Z'),
    ]

    const updated = withReaction(messages, 'm1', 2, 'fire')

    expect(updated[0].reactions).toEqual([
      { user_number: 1, reaction: 'like' },
      { user_number: 2, reaction: 'fire' },
    ])
    expect(updated[1]).toBe(messages[1])
  })

  it('retire la réaction avec null, sans toucher à celle des autres', () => {
    const messages: Message[] = [
      {
        ...message('m1', '2026-11-02T10:00:00.000Z'),
        reactions: [
          { user_number: 1, reaction: 'run' },
          { user_number: 2, reaction: 'run' },
        ],
      },
    ]

    expect(withReaction(messages, 'm1', 1, null)[0].reactions).toEqual([
      { user_number: 2, reaction: 'run' },
    ])
  })
})
