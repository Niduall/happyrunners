/**
 * Un point d'un tracé GPX.
 *
 * Définition unique : `types/index.ts` la ré-exporte. Ne pas en créer une
 * seconde copie dans un autre fichier de types.
 */
export interface GPXPoint {
  lat: number
  lng: number
  ele?: number
  time?: string
}

export interface Parcours {
  id: string
  name: string
  description?: string
  distance_km: number
  elevation_gain_m?: number
  points: GPXPoint[]
  /** user_number du créateur (null si inconnu) */
  created_by: number | null
  created_at: string
  updated_at: string
}

/**
 * Parcours sans le tracé GPX.
 *
 * La liste est rechargée toutes les 30 s : elle ne doit pas transporter les
 * coordonnées (1,1 Mo pour 5 parcours). Le tracé est chargé à la demande
 * quand la carte est dépliée.
 */
export type ParcoursSummary = Omit<Parcours, 'points'>

export interface ParcoursInsert {
  name: string
  description?: string
  distance_km: number
  elevation_gain_m?: number
  points: GPXPoint[]
  created_by: number | null
}

/**
 * Choix du parcours pour la semaine.
 * UNIQUE (user_number, week_key) : une seule ligne par personne et par semaine.
 */
export interface Participation {
  id: string
  parcours_id: string
  user_number: number
  status: 'yes' | 'no'
  week_key: string
  created_at: string
  updated_at: string
}

export interface ParticipationInsert {
  parcours_id: string
  user_number: number
  week_key: string
  status: 'yes' | 'no'
}

/** Réponse globale : est-ce que la personne vient cette semaine ? */
export type AttendanceStatus = 'going' | 'skip'

/** UNIQUE (week_key, user_number) : une réponse par personne et par semaine */
export interface Attendance {
  id: string
  week_key: string
  user_number: number
  status: AttendanceStatus
  created_at: string
  updated_at: string
}

export interface AttendanceInsert {
  week_key: string
  user_number: number
  status: AttendanceStatus
}

/**
 * Profil utilisateur.
 * `user_number` est l'identifiant technique stable (1, 2, 3…), attribué par
 * la base. Il ne change JAMAIS : modifier son nom ne le touche pas, donc
 * les votes et le PIN restent attachés à la bonne personne.
 */
export interface UserProfile {
  id: string
  user_number: number
  first_name: string
  last_name: string
  pin_hash: string | null
  created_at: string
  updated_at: string
}

/**
 * Les trois champs d'identité d'un profil, en snake_case (forme base).
 * Utilisé partout où seuls le numéro et le nom sont nécessaires — évite de
 * réécrire la même forme à la main.
 */
export type ProfileIdentity = Pick<UserProfile, 'user_number' | 'first_name' | 'last_name'>

export interface UserProfileInsert {
  first_name: string
  last_name: string
  pin_hash: string | null
}

export interface UserProfileUpdate {
  first_name?: string
  last_name?: string
  pin_hash?: string | null
}

/**
 * Message du fil de discussion.
 *
 * Pas de `week_key` : la fenêtre de lecture est glissante (30 jours) et
 * calculée côté client à partir de `created_at`. Pas de `updated_at` non
 * plus : un message ne s'édite pas.
 */
export interface Message {
  id: string
  user_number: number
  body: string
  created_at: string
  /**
   * Réactions reçues, chargées avec le message. Optionnel : un message
   * optimiste n'en a pas encore, et les tests peuvent l'omettre.
   */
  reactions?: MessageReaction[]
  /**
   * Réponse citée. `reply_to_body` et `reply_to_user_number` sont un
   * instantané pris à l'envoi : ils survivent à la purge de l'original, qui
   * remet seulement `reply_to_id` à NULL.
   */
  reply_to_id?: string | null
  reply_to_body?: string | null
  reply_to_user_number?: number | null
}

/**
 * Clés de la palette de réactions.
 *
 * On stocke une clé et non un emoji : la palette se change côté client sans
 * migration, et le CHECK de `message_reactions` interdit une valeur inconnue.
 */
export type ReactionKey = 'like' | 'love' | 'laugh' | 'run' | 'fire'

/** Une réaction : la clé primaire (message, personne) en garantit l'unicité. */
export interface MessageReaction {
  user_number: number
  reaction: ReactionKey
}

/**
 * Ce que chaque personne accepte de recevoir.
 *
 * Les lignes sont créées à la première modification ; en leur absence, les
 * deux catégories sont considérées comme actives. L'abonnement push lui-même
 * reste un geste explicite sur chaque appareil.
 */
export interface NotificationPreferences {
  messages: boolean
  runReminder: boolean
}

/**
 * Origine du parcours déclaré.
 *
 * `manual` aujourd'hui ; `gpx` et `strava` sont prévus pour une preuve de
 * tracé. La colonne existe dès la première migration pour éviter un second
 * changement de schéma le jour où l'import arrivera.
 *
 * `health` = chiffres validés depuis ce que la montre a proposé (tâche 37).
 */
export type WeeklyRunSource = 'manual' | 'gpx' | 'strava' | 'health'

/**
 * Sortie réellement courue par une personne, une ligne par personne et par
 * mercredi passé.
 *
 * `parcours_name`, `distance_km` et `elevation_gain_m` sont des instantanés
 * pris à la déclaration : renommer, modifier ou supprimer un parcours ne
 * réécrit pas les totaux d'une ligue passée.
 *
 * Une sortie « autre » a `parcours_id` NULL et son libellé libre dans
 * `parcours_name` ; sa distance reste NULL.
 */
export interface WeeklyRun {
  week_key: string
  user_number: number
  parcours_id: string | null
  parcours_name: string
  source: WeeklyRunSource
  distance_km: number | null
  elevation_gain_m: number | null
  declared_at: string
  updated_at: string
}

export interface WeeklyRunInsert {
  week_key: string
  user_number: number
  parcours_id: string | null
  parcours_name: string
  source?: WeeklyRunSource
  distance_km?: number | null
  elevation_gain_m?: number | null
}

/**
 * Réponse explicite « je n'ai pas couru » pour un mercredi, par personne.
 *
 * Elle suit la personne d'un appareil à l'autre, contrairement à un repère
 * local. Ce n'est pas `attendances.status = 'skip'` (« pas cette semaine »,
 * une intention) : ici c'est un fait constaté après le run.
 *
 * Aucune sortie n'est créée et aucun total de km n'en tient compte. Déclarer
 * une sortie supprime la réponse de la semaine (trigger en base).
 */
export interface WeeklyRunSkip {
  week_key: string
  user_number: number
  declared_at: string
}

/**
 * Lien entre une application de santé du téléphone et un profil.
 *
 * Le client ne lit **jamais** `token_hash` : il ne connaît que le jeton en
 * clair de son propre appareil (localStorage). La colonne existe en base pour
 * que l'Edge Function puisse retrouver la personne.
 */
export interface DeviceLink {
  id: string
  user_number: number
  label: string
  created_at: string
  last_seen_at: string | null
  updated_at: string
}

export type ImportProposalStatus = 'pending' | 'accepted' | 'ignored'

/**
 * Ce que la montre a proposé, avant validation.
 *
 * Rien n'entre dans le classement sans accord : la ligne reste `pending`
 * jusqu'à ce que la personne clique « Valider ». `started_at` sert à retrouver
 * la semaine (règle du mercredi 14h, dans `weekKey.ts`).
 */
export interface ImportProposal {
  id: string
  user_number: number
  source: 'health'
  external_id: string
  activity_type: string
  started_at: string
  duration_s: number | null
  distance_m: number | null
  status: ImportProposalStatus
  created_at: string
}
