import { describe, it, expect } from 'vitest'
// Import `?raw` : Vite lit le fichier en texte. Évite d'ajouter @types/node
// pour un seul test (le typage vient déjà de vite/client).
import schema from '../../schema.sql?raw'

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
  it('déclare les 4 tables utilisées par l\'app', () => {
    for (const table of ['user_profiles', 'parcours', 'attendances', 'participations']) {
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
    // Vérifié contre information_schema : 3 FK, toutes en CASCADE.
    // `parcours.created_by` n'en a volontairement pas (colonne jamais lue).
    expect(refs).toEqual([
      'user_profiles', // attendances.user_number
      'parcours',      // participations.parcours_id
      'user_profiles', // participations.user_number
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

  it('active RLS et ouvre les 4 tables', () => {
    for (const table of ['user_profiles', 'parcours', 'attendances', 'participations']) {
      expect(schema).toMatch(
        new RegExp(`ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`)
      )
    }
    // 4 tables x 4 politiques
    expect([...schema.matchAll(/CREATE POLICY/g)]).toHaveLength(16)
  })

  it('documente que la sécurité RLS est ouverte', () => {
    // Si un jour quelqu'un durcit les politiques, ce commentaire doit
    // disparaître dans le même commit — c'est un marqueur volontaire.
    expect(schema).toMatch(/aucune authentification serveur/i)
  })
})