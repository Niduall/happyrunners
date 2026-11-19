import { describe, it, expect } from 'vitest'
// Import `?raw` : Vite lit le fichier en texte. Évite d'ajouter @types/node
// pour un seul test (le typage vient déjà de vite/client).
import schema from '../../schema.sql?raw'
import migration from '../../migrations/2026-10-25_tache17.sql?raw'
import chatMigration from '../../migrations/2026-11-02_tache29_chat.sql?raw'
import pushMigration from '../../migrations/2026-11-04_tache31_notifications_push.sql?raw'
import reactionsMigration from '../../migrations/2026-11-06_tache32_reactions_chat.sql?raw'
import repliesMigration from '../../migrations/2026-11-10_tache34_reponse_chat.sql?raw'
import historyMigration from '../../migrations/2026-11-12_tache35_historique.sql?raw'
import skipMigration from '../../migrations/2026-11-16_tache36_je_nai_pas_couru.sql?raw'
import watchMigration from '../../migrations/2026-11-17_tache37_montre.sql?raw'

/**
 * schema.sql est la source de vérité de la structure de la base.
 * Ces tests le verrouillent : le jour où quelqu'un change une contrainte en
 * production sans mettre à jour le fichier, ils échouent.
 *
 * ⚠️ Ils vérifient que le FICHIER reste cohérent. Ils ne prouvent pas que la
 * base correspond au fichier — pour ça il faut comparer avec
 * information_schema (voir README § Sauvegarde).
 */

describe('schema.sql — structure', () => {
  it('déclare les 12 tables utilisées par l\'app', () => {
    for (const table of [
      'user_profiles',
      'parcours',
      'attendances',
      'participations',
      'messages',
      'message_reactions',
      'push_subscriptions',
      'notification_preferences',
      'weekly_runs',
      'weekly_run_skips',
      'device_links',
      'import_proposals',
    ]) {
      expect(schema).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`))
    }
  })

  it('ne recrée pas les tables mortes de l\'ancien identifiant', () => {
    // `profiles` et `responses` sont supprimées en fin de fichier. Si quelqu'un
    // les réintroduit, le fichier ressusciterait un modèle de données abandonné.
    expect(schema).toMatch(/DROP TABLE IF EXISTS responses/)
    expect(schema).toMatch(/DROP TABLE IF EXISTS profiles/)
  })

  it('déclare la séquence user_number AVANT user_profiles', () => {
    // user_profiles.user_number a pour défaut nextval('user_number_seq').
    // Si la séquence est déclarée après, la table échoue à la création.
    const seq = schema.indexOf('CREATE SEQUENCE IF NOT EXISTS user_number_seq')
    const table = schema.indexOf('CREATE TABLE IF NOT EXISTS user_profiles')
    expect(seq).toBeGreaterThan(-1)
    expect(seq).toBeLessThan(table)
  })

  it('ne déclare que les clés étrangères réellement présentes en prod', () => {
    const refs = [...schema.matchAll(/REFERENCES\s+(\w+)/g)].map((m) => m[1])
    // 13 FK. Les historiques en CASCADE ; les deux de la réponse citée et
    // celles de l'historique en SET NULL, pour que supprimer l'original ne
    // supprime pas ce qui le cite.
    // `parcours.created_by` n'en a volontairement pas (colonne jamais lue).
    expect(refs).toEqual([
      'user_profiles', // attendances.user_number
      'parcours',      // participations.parcours_id
      'user_profiles', // participations.user_number
      'user_profiles', // messages.user_number
      'messages',      // messages.reply_to_id (auto-référence)
      'user_profiles', // messages.reply_to_user_number
      'messages',      // message_reactions.message_id
      'user_profiles', // message_reactions.user_number
      'user_profiles', // push_subscriptions.user_number
      'user_profiles', // notification_preferences.user_number
      'user_profiles', // weekly_runs.user_number
      'parcours',      // weekly_runs.parcours_id
      'user_profiles', // weekly_run_skips.user_number
      'user_profiles', // device_links.user_number
      'user_profiles', // import_proposals.user_number
    ])
  })

  it('impose un seul choix de parcours par personne et par semaine', () => {
    // C'est cette contrainte qui empêche d'être compté sur deux parcours.
    expect(schema).toMatch(
      /UNIQUE INDEX IF NOT EXISTS participations_user_number_week_key_key[\s\S]*user_number, week_key/
    )
  })

  it('emporte les votes quand un parcours est supprimé', () => {
    // Le CASCADE est ce que la confirmation de suppression annonce à
    // l'utilisateur (« N votes seront perdus »). Le retirer rend le
    // message faux et laisse des votes orphelins.
    expect(schema).toMatch(
      /parcours_id uuid\s+NOT NULL REFERENCES parcours\(id\) ON DELETE CASCADE/
    )
  })

  it('restreint les statuts', () => {
    expect(schema).toMatch(/CHECK \(status IN \('going', 'skip'\)\)/)
    expect(schema).toMatch(/CHECK \(status IN \('yes', 'no'\)\)/)
  })

  it('exige une présence « going » pour enregistrer un vote', () => {
    // La règle ne doit pas rester côté client : c'est ce qui a produit le
    // vote orphelin #16 / 2026-10-14.
    expect(schema).toMatch(
      /CREATE OR REPLACE FUNCTION require_going_attendance/
    )
    expect(schema).toMatch(/BEFORE INSERT OR UPDATE ON participations/)
    expect(schema).toMatch(/status = 'going'/)
    // FOR SHARE sérialise le vote et le passage à « skip ».
    expect(schema).toMatch(/FOR SHARE/)
    expect(schema).toMatch(
      /DROP TRIGGER IF EXISTS participations_require_going ON participations/
    )
  })

  it('retire le vote quand la présence passe à « skip » ou disparaît', () => {
    expect(schema).toMatch(
      /CREATE OR REPLACE FUNCTION remove_vote_when_not_going/
    )
    expect(schema).toMatch(
      /AFTER UPDATE OF status ON attendances[\s\S]*WHEN \(NEW\.status <> 'going'\)/
    )
    expect(schema).toMatch(/AFTER DELETE ON attendances/)
    expect(schema).toMatch(
      /DROP TRIGGER IF EXISTS attendances_remove_vote_when_not_going/
    )
    expect(schema).toMatch(
      /DROP TRIGGER IF EXISTS attendances_remove_vote_on_delete/
    )
  })

  it('autorise un profil sans PIN', () => {
    // NULL = pas de PIN. C'est ce qui permet à un profil d'exister
    // avant que la personne choisisse d'en ajouter un.
    expect(schema).toMatch(/pin_hash\s+text,/)
  })

  it('active RLS et ouvre les 12 tables', () => {
    for (const table of [
      'user_profiles',
      'parcours',
      'attendances',
      'participations',
      'messages',
      'message_reactions',
      'push_subscriptions',
      'notification_preferences',
      'weekly_runs',
      'weekly_run_skips',
      'device_links',
      'import_proposals',
    ]) {
      expect(schema).toMatch(
        new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`)
      )
    }
    // 11 tables × 4 politiques + messages × 3 (pas d'UPDATE)
    expect([...schema.matchAll(/CREATE POLICY/g)]).toHaveLength(47)
  })

  it('rend un message immuable : aucune politique UPDATE', () => {
    // L'absence de politique est volontaire : un message ne s'édite pas, même
    // avec la clé anon. Seule la suppression est permise.
    expect(schema).not.toMatch(/CREATE POLICY \w+\s+ON messages FOR UPDATE/)
    expect(schema).toMatch(/CREATE POLICY messages_lire\s+ON messages FOR SELECT/)
    expect(schema).toMatch(/CREATE POLICY messages_inserer\s+ON messages FOR INSERT/)
    expect(schema).toMatch(/CREATE POLICY messages_supprimer\s+ON messages FOR DELETE/)
  })

  it('documente que la sécurité RLS est ouverte', () => {
    // Si un jour quelqu'un durcit les politiques, ce commentaire doit
    // disparaître dans le même commit — c'est un marqueur volontaire.
    expect(schema).toMatch(/aucune authentification serveur/i)
  })

  it('met à jour updated_at automatiquement sur les 6 tables', () => {
    // Sans trigger, re-voter ou changer de présence laissait updated_at
    // figée à la date de création (les upserts ne l'écrivent pas).
    expect(schema).toMatch(/CREATE OR REPLACE FUNCTION touch_updated_at\(\)/)
    expect(schema).toMatch(/NEW\.updated_at = now\(\)/)

    for (const table of [
      'parcours',
      'attendances',
      'participations',
      'push_subscriptions',
      'notification_preferences',
      'weekly_runs',
    ]) {
      expect(schema).toMatch(new RegExp(`DROP TRIGGER IF EXISTS trg_${table}_touch ON ${table}`))
      expect(schema).toMatch(
        new RegExp(
          `CREATE TRIGGER trg_${table}_touch\\s+BEFORE UPDATE ON ${table}\\s+FOR EACH ROW EXECUTE FUNCTION touch_updated_at\\(\\)`
        )
      )
    }

    // Le bloc était commenté avant la tâche 17 : plus aucune ligne ne doit
    // commencer par « -- CREATE TRIGGER ».
    expect(schema).not.toMatch(/^-- CREATE TRIGGER/m)
  })

  it('impose un nom unique, insensible à la casse', () => {
    // `findProfileByName` cherche en ILIKE : sans cette contrainte,
    // « paulin claudin » et « Paulin Claudin » créent deux comptes.
    expect(schema).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_name_key[\s\S]*?lower\(first_name\), lower\(last_name\)/
    )
  })

  it("ne recrée pas l'index redondant sur attendances.week_key", () => {
    // L'index unique (week_key, user_number) couvre déjà les lectures par
    // semaine : un second index sur la seule première colonne ne sert à rien.
    expect(schema).not.toMatch(/CREATE INDEX IF NOT EXISTS idx_attendances_week/)
  })
})

describe('table weekly_runs', () => {
  it('garde un instantané et une ligne par personne et par semaine', () => {
    // Le groupe ne fait pas toujours le même parcours : la clé primaire
    // composite porte « une sortie par personne et par mercredi ».
    expect(schema).toMatch(
      /CREATE TABLE IF NOT EXISTS weekly_runs[\s\S]*?PRIMARY KEY \(week_key, user_number\)/
    )
    expect(schema).toMatch(
      /user_number\s+integer NOT NULL\s+REFERENCES user_profiles\(user_number\) ON DELETE CASCADE/
    )
    // Le nom, la distance et le dénivelé sont figés : modifier un parcours ne
    // réécrit pas les totaux d'une ligue passée.
    expect(schema).toMatch(
      /parcours_name\s+text\s+NOT NULL CHECK \(btrim\(parcours_name\) <> ''\)/
    )
  })

  it('détache le lien sans perdre le nom', () => {
    expect(schema).toMatch(
      /parcours_id\s+uuid REFERENCES parcours\(id\) ON DELETE SET NULL/
    )
  })

  it('indexe la personne pour les statistiques', () => {
    // La clé primaire commence par `week_key` : sans cet index, « toutes les
    // sorties d'une personne » parcourrait la table.
    expect(schema).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_weekly_runs_user[\s\S]*?\(user_number\)/
    )
  })

  it('borne la source et les valeurs', () => {
    expect(schema).toMatch(
      /CHECK \(source IN \('manual', 'gpx', 'strava', 'health'\)\)/
    )
    expect(schema).toMatch(/distance_km IS NULL OR distance_km >= 0/)
    expect(schema).toMatch(/elevation_gain_m IS NULL OR elevation_gain_m >= 0/)
  })

  it('ne dépend pas d’un trigger de présence', () => {
    // Déclarer sa sortie remet la présence à « going » côté application :
    // exiger la présence avant la déclaration bloquerait celles et ceux qui
    // ont couru sans répondre.
    expect(schema).not.toMatch(/require_going_weekly_run/)
    expect(schema).not.toMatch(/weekly_runs_require_going/)
  })
})

describe('migration 2026-11-12 (tâche 35)', () => {
  it('reprend la table, les index, le trigger et les quatre politiques', () => {
    expect(historyMigration).toMatch(/CREATE TABLE IF NOT EXISTS weekly_runs/)
    expect(historyMigration).toMatch(/PRIMARY KEY \(week_key, user_number\)/)
    expect(historyMigration).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_weekly_runs_parcours/
    )
    expect(historyMigration).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_weekly_runs_user/
    )
    expect(historyMigration).toMatch(/CREATE TRIGGER trg_weekly_runs_touch/)
    expect(historyMigration).not.toMatch(/require_going_weekly_run/)

    for (const action of ['lire', 'inserer', 'modifier', 'supprimer']) {
      expect(historyMigration).toMatch(
        new RegExp(`CREATE POLICY weekly_runs_${action}`)
      )
    }
  })

  it('est rejouable et ne supprime aucune donnée', () => {
    expect(historyMigration).toMatch(/CREATE TABLE IF NOT EXISTS/)
    expect(historyMigration).toMatch(/DROP POLICY IF EXISTS/)
    expect(historyMigration).toMatch(/DROP TRIGGER IF EXISTS/)
    expect(historyMigration).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/)
  })

  it('applique tout ou rien', () => {
    expect(historyMigration).toMatch(/^BEGIN;/m)
    expect(historyMigration.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
})

describe('table weekly_run_skips', () => {
  it('garde une réponse par personne et par semaine', () => {
    // La clé primaire porte la règle : répondre deux fois ne crée pas de
    // doublon, et la réponse suit la personne d'un appareil à l'autre.
    expect(schema).toMatch(
      /CREATE TABLE IF NOT EXISTS weekly_run_skips[\s\S]*?PRIMARY KEY \(week_key, user_number\)/
    )
    expect(schema).toMatch(
      /weekly_run_skips[\s\S]*?user_number\s+integer NOT NULL\s+REFERENCES user_profiles\(user_number\) ON DELETE CASCADE/
    )
  })

  it('indexe la personne pour les statistiques', () => {
    expect(schema).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_weekly_run_skips_user[\s\S]*?\(user_number\)/
    )
  })

  it('efface la réponse quand une sortie est déclarée', () => {
    // On ne peut pas avoir couru ET déclaré ne pas avoir couru.
    expect(schema).toMatch(
      /CREATE OR REPLACE FUNCTION clear_run_skip_when_declared/
    )
    expect(schema).toMatch(
      /AFTER INSERT OR UPDATE ON weekly_runs[\s\S]*?clear_run_skip_when_declared\(\)/
    )
  })

  it('ignore une réponse tardive si une sortie existe déjà', () => {
    // Effacer la sortie serait pire que perdre la réponse : on l'ignore.
    expect(schema).toMatch(
      /CREATE OR REPLACE FUNCTION ignore_run_skip_when_run_exists/
    )
    expect(schema).toMatch(
      /BEFORE INSERT OR UPDATE ON weekly_run_skips[\s\S]*?ignore_run_skip_when_run_exists\(\)/
    )
  })
})

describe('migration 2026-11-16 (tâche 36)', () => {
  it('reprend la table, l’index, les triggers et les quatre politiques', () => {
    expect(skipMigration).toMatch(
      /CREATE TABLE IF NOT EXISTS weekly_run_skips/
    )
    expect(skipMigration).toMatch(/PRIMARY KEY \(week_key, user_number\)/)
    expect(skipMigration).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_weekly_run_skips_user/
    )
    expect(skipMigration).toMatch(/CREATE TRIGGER weekly_runs_clear_skip/)
    expect(skipMigration).toMatch(
      /CREATE TRIGGER weekly_run_skips_ignore_if_run/
    )

    for (const action of ['lire', 'inserer', 'modifier', 'supprimer']) {
      expect(skipMigration).toMatch(
        new RegExp(`CREATE POLICY weekly_run_skips_${action}`)
      )
    }
  })

  it('est rejouable et ne supprime aucune donnée à l’exécution', () => {
    expect(skipMigration).toMatch(/CREATE TABLE IF NOT EXISTS/)
    expect(skipMigration).toMatch(/DROP POLICY IF EXISTS/)
    expect(skipMigration).toMatch(/DROP TRIGGER IF EXISTS/)
    // Le seul DELETE vit dans le corps d'un trigger, pas dans la migration.
    expect(skipMigration).not.toMatch(/^DELETE FROM/m)
    expect(skipMigration).not.toMatch(/TRUNCATE|DROP TABLE/)
  })

  it('applique tout ou rien', () => {
    expect(skipMigration).toMatch(/^BEGIN;/m)
    expect(skipMigration.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
})

describe('migration 2026-11-04 (tâche 31)', () => {
  it('reprend les tables et leurs politiques', () => {
    expect(pushMigration).toMatch(/CREATE TABLE IF NOT EXISTS push_subscriptions/)
    expect(pushMigration).toMatch(/CREATE TABLE IF NOT EXISTS notification_preferences/)
    expect(pushMigration).toMatch(/endpoint\s+text NOT NULL UNIQUE/)
    expect(pushMigration).toMatch(/idx_push_subscriptions_user/)

    for (const table of ['push_subscriptions', 'notification_preferences']) {
      for (const action of ['lire', 'inserer', 'modifier', 'supprimer']) {
        expect(pushMigration).toMatch(
          new RegExp(`CREATE POLICY ${table}_${action}`)
        )
      }
    }
  })

  it('est rejouable et ne supprime aucune donnée', () => {
    expect(pushMigration).toMatch(/CREATE TABLE IF NOT EXISTS/)
    expect(pushMigration).toMatch(/DROP POLICY IF EXISTS/)
    expect(pushMigration).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/)
  })

  it('applique tout ou rien', () => {
    expect(pushMigration).toMatch(/^BEGIN;/m)
    expect(pushMigration.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
})

describe('migration 2026-11-02 (tâche 29)', () => {
  it('reprend la table et ses politiques', () => {
    expect(chatMigration).toMatch(/CREATE TABLE IF NOT EXISTS messages/)
    expect(chatMigration).toMatch(
      /CHECK \(char_length\(body\) BETWEEN 1 AND 500\)/
    )
    expect(chatMigration).toMatch(/CREATE INDEX IF NOT EXISTS idx_messages_created/)

    for (const policy of [
      'messages_lire',
      'messages_inserer',
      'messages_supprimer',
    ]) {
      expect(chatMigration).toMatch(new RegExp(`CREATE POLICY ${policy}`))
    }
  })

  it('est rejouable et ne supprime aucune donnée', () => {
    expect(chatMigration).toMatch(/CREATE TABLE IF NOT EXISTS/)
    expect(chatMigration).toMatch(/DROP POLICY IF EXISTS/)
    // `ON DELETE CASCADE` est une clause de clé étrangère, pas une suppression.
    expect(chatMigration).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/)
  })

  it('applique tout ou rien', () => {
    expect(chatMigration).toMatch(/^BEGIN;/m)
    expect(chatMigration.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
})

describe('table messages', () => {
  it('borne la longueur en base, pas seulement dans l’interface', () => {
    expect(schema).toMatch(/CHECK \(char_length\(body\) BETWEEN 1 AND 500\)/)
  })

  it('indexe la lecture par date décroissante', () => {
    expect(schema).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_messages_created[\s\S]*?created_at DESC/
    )
  })

  it('n’a pas de updated_at : un message ne s’édite pas', () => {
    const start = schema.indexOf('CREATE TABLE IF NOT EXISTS messages')
    const end = schema.indexOf('idx_messages_created')
    const table = schema.slice(start, end)

    expect(table).not.toMatch(/updated_at/)
  })

  it('garde un instantané de la réponse citée, détaché de l’original', () => {
    const start = schema.indexOf('CREATE TABLE IF NOT EXISTS messages')
    const end = schema.indexOf('idx_messages_created')
    const table = schema.slice(start, end)

    // SET NULL et non CASCADE : supprimer l'original ne doit pas emporter la
    // réponse. Le texte reste lisible grâce à l'instantané.
    expect(table).toMatch(
      /reply_to_id\s+uuid REFERENCES messages\(id\) ON DELETE SET NULL/
    )
    expect(table).toMatch(/reply_to_body\s+text/)
    expect(table).toMatch(
      /reply_to_user_number integer REFERENCES user_profiles\(user_number\) ON DELETE SET NULL/
    )
    expect(table).toMatch(
      /messages_reply_body_length[\s\S]*?char_length\(reply_to_body\) BETWEEN 1 AND 500/
    )
  })
})

describe('migration 2026-10-25 (tâche 17)', () => {
  it('reprend les mêmes objets que schema.sql', () => {
    for (const table of ['parcours', 'attendances', 'participations']) {
      expect(migration).toMatch(new RegExp(`CREATE TRIGGER trg_${table}_touch`))
    }
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_name_key/)
    expect(migration).toMatch(/lower\(first_name\), lower\(last_name\)/)
    expect(migration).toMatch(/DROP INDEX IF EXISTS idx_attendances_week/)
  })

  it('est rejouable', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION touch_updated_at/)
    expect(migration.match(/DROP TRIGGER IF EXISTS trg_\w+_touch/g)).toHaveLength(3)
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/)
  })

  it('refuse de créer l\'index si des noms sont déjà en doublon', () => {
    // Sinon l'échec serait « could not create unique index », sans dire
    // quels profils fusionner avant de relancer.
    expect(migration).toMatch(/HAVING count\(\*\) > 1/)
    expect(migration).toMatch(/RAISE EXCEPTION/)
  })

  it('applique tout ou rien', () => {
    expect(migration).toMatch(/^BEGIN;/m)
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
})
describe('table message_reactions', () => {
  it('garantit une seule réaction par personne et par message', () => {
    // La clé primaire porte la règle métier : l'interface ne peut pas la
    // contourner, même avec deux appuis rapides.
    expect(schema).toMatch(
      /CREATE TABLE IF NOT EXISTS message_reactions[\s\S]*?PRIMARY KEY \(message_id, user_number\)/
    )
  })

  it('borne les clés de réaction en base', () => {
    expect(schema).toMatch(
      /CHECK \(reaction IN \('like', 'love', 'laugh', 'run', 'fire'\)\)/
    )
  })

  it('supprime les réactions avec le message ou le profil', () => {
    const start = schema.indexOf('CREATE TABLE IF NOT EXISTS message_reactions')
    const end = schema.indexOf('CREATE INDEX IF NOT EXISTS idx_message_reactions_message')
    const table = schema.slice(start, end)

    expect(table.match(/ON DELETE CASCADE/g)).toHaveLength(2)
  })

  it('indexe la lecture des réactions par message', () => {
    expect(schema).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_message_reactions_message[\s\S]*?message_id/
    )
  })

  it('autorise UPDATE pour l’upsert, contrairement aux messages', () => {
    expect(schema).toMatch(
      /CREATE POLICY message_reactions_modifier\s+ON message_reactions FOR UPDATE/
    )
  })
})

describe('migration 2026-11-06 (tâche 32)', () => {
  it('reprend la table, l’index et les quatre politiques', () => {
    expect(reactionsMigration).toMatch(
      /CREATE TABLE IF NOT EXISTS message_reactions/
    )
    expect(reactionsMigration).toMatch(
      /PRIMARY KEY \(message_id, user_number\)/
    )
    expect(reactionsMigration).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_message_reactions_message/
    )

    for (const action of ['lire', 'inserer', 'modifier', 'supprimer']) {
      expect(reactionsMigration).toMatch(
        new RegExp(`CREATE POLICY message_reactions_${action}`)
      )
    }
  })

  it('est rejouable et ne supprime aucune donnée', () => {
    expect(reactionsMigration).toMatch(/CREATE TABLE IF NOT EXISTS/)
    expect(reactionsMigration).toMatch(/DROP POLICY IF EXISTS/)
    expect(reactionsMigration).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/)
  })

  it('applique tout ou rien', () => {
    expect(reactionsMigration).toMatch(/^BEGIN;/m)
    expect(reactionsMigration.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
})

describe('migration 2026-11-10 (tâche 34)', () => {
  it('ajoute les trois colonnes, les clés étrangères et la borne', () => {
    for (const column of [
      'reply_to_id',
      'reply_to_body',
      'reply_to_user_number',
    ]) {
      expect(repliesMigration).toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`)
      )
    }

    expect(repliesMigration).toMatch(
      /messages_reply_to_id_fkey[\s\S]*?REFERENCES messages\(id\) ON DELETE SET NULL/
    )
    expect(repliesMigration).toMatch(
      /messages_reply_to_user_number_fkey[\s\S]*?ON DELETE SET NULL/
    )
    expect(repliesMigration).toMatch(
      /messages_reply_body_length[\s\S]*?BETWEEN 1 AND 500/
    )
  })

  it('indexe le lien pour que la purge ne parcoure pas toute la table', () => {
    expect(repliesMigration).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_messages_reply_to/
    )
  })

  it('est rejouable et ne supprime aucune donnée', () => {
    expect(repliesMigration).toMatch(/ADD COLUMN IF NOT EXISTS/)
    // Les contraintes sont ajoutées seulement si le catalogue ne les connaît
    // pas encore : rejouer le fichier ne doit pas échouer.
    expect(repliesMigration).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/
    )
    expect(repliesMigration).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/)
  })

  it('applique tout ou rien', () => {
    expect(repliesMigration).toMatch(/^BEGIN;/m)
    expect(repliesMigration.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
})

describe('migration 2026-11-17 (tâche 37)', () => {
  it('crée le lien de la montre et les propositions', () => {
    expect(watchMigration).toMatch(/CREATE TABLE IF NOT EXISTS device_links/)
    expect(watchMigration).toMatch(/CREATE TABLE IF NOT EXISTS import_proposals/)
    // On ne stocke qu'une empreinte : un jeton en clair en base serait une
    // fuite de capacité d'écriture.
    expect(watchMigration).toMatch(/token_hash\s+text\s+NOT NULL UNIQUE/)
    expect(watchMigration).toMatch(/char_length\(token_hash\) = 64/)
    expect(watchMigration).toMatch(/UNIQUE \(user_number, external_id\)/)
    expect(watchMigration).toMatch(
      /idx_import_proposals_user_status[\s\S]*?user_number, status, started_at DESC/
    )
  })

  it('élargit la source sans perdre les valeurs existantes', () => {
    expect(watchMigration).toMatch(
      /CHECK \(source IN \('manual', 'gpx', 'strava', 'health'\)\)/
    )
    // La contrainte est retirée par son contenu, pas par son nom : la prod
    // peut l'avoir nommée autrement.
    expect(watchMigration).toMatch(/pg_get_constraintdef\(oid\) ILIKE '%source%'/)
  })

  it('est rejouable et ne supprime aucune donnée à l’exécution', () => {
    expect(watchMigration).toMatch(/CREATE TABLE IF NOT EXISTS/)
    expect(watchMigration).toMatch(/DROP POLICY IF EXISTS/)
    expect(watchMigration).toMatch(/DROP TRIGGER IF EXISTS/)
    expect(watchMigration).not.toMatch(/^DELETE FROM/m)
    expect(watchMigration).not.toMatch(/TRUNCATE|DROP TABLE/)
  })

  it('applique tout ou rien', () => {
    expect(watchMigration).toMatch(/^BEGIN;/m)
    expect(watchMigration.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
})
