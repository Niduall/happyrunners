-- =============================================================================
-- HappyRunners — historique des sorties (tâche 35)
-- =============================================================================
-- Une ligne par PERSONNE et par mercredi passé : ce que chacun a réellement
-- couru. Le groupe ne fait pas toujours le même parcours, et une ligue ou des
-- badges exigent de savoir qui a fait quoi.
--
--   - Le vote (`participations`) dit ce que le groupe préférait. `weekly_runs`
--     dit ce qui a été couru, personne par personne. Les deux tables restent
--     séparées : ne jamais présenter le parcours gagnant du vote comme un fait.
--   - Clé primaire `(week_key, user_number)` : une seule déclaration par
--     personne et par semaine. Corriger revient à faire un upsert, et le
--     trigger `touch_updated_at` garde la trace de la dernière modification.
--   - `parcours_name` est un INSTANTANÉ du nom. `distance_km` et
--     `elevation_gain_m` sont aussi recopiés du parcours au moment de la
--     déclaration : sans ces instantanés, renommer, modifier ou supprimer un
--     parcours réécrirait les totaux d'une ligue passée.
--   - Pour une sortie « autre » (aucun parcours enregistré), `parcours_id` est
--     NULL et `parcours_name` porte le libellé libre. La distance reste NULL :
--     on ne compte que ce qui est connu, jamais un chiffre inventé.
--   - `source` prépare la suite : `manual` aujourd'hui, `gpx` puis `strava`
--     quand une preuve de tracé sera ajoutée. Aucune de ces sources n'est
--     encore écrite par l'application.
--   - `declared_at` / `updated_at` : quand la sortie a été renseignée et
--     corrigée. Chacun ne renseigne que la sienne (décision de la tâche 35) ;
--     l'application remet aussi sa présence à « going » pour la semaine, pour
--     que « présent » et « a couru » ne se contredisent pas.
--   - `ON DELETE CASCADE` sur `user_number` : supprimer un profil emporte ses
--     sorties. Il n'y a pas d'écran de suppression de profil ; le jour où il
--     en existera un, cette règle devra être rediscutée (une ligue peut vouloir
--     garder l'historique d'une personne partie).
--
-- RLS ouverte comme le reste du projet : il n'y a pas d'authentification
-- serveur (§6 de la cartographie).
--
-- Rejouable : `IF NOT EXISTS` / `DROP ... IF EXISTS` partout.
-- À appliquer d'abord sur la base de TEST, puis sur la prod après validation.
-- Dépend de `touch_updated_at()`, créée par la migration de la tâche 17.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Table : weekly_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_runs (
  week_key          text    NOT NULL,
  user_number       integer NOT NULL
                      REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  parcours_id       uuid REFERENCES parcours(id) ON DELETE SET NULL,
  parcours_name     text    NOT NULL CHECK (btrim(parcours_name) <> ''),
  source            text    NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'gpx', 'strava')),
  distance_km       numeric
                      CHECK (distance_km IS NULL OR distance_km >= 0),
  elevation_gain_m  numeric
                      CHECK (elevation_gain_m IS NULL OR elevation_gain_m >= 0),
  declared_at       timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Une seule sortie par personne et par semaine.
  PRIMARY KEY (week_key, user_number)
);

-- `ON DELETE SET NULL` met à jour les lignes qui pointent vers le parcours
-- supprimé : sans cet index, chaque suppression parcourrait toute la table.
CREATE INDEX IF NOT EXISTS idx_weekly_runs_parcours
  ON weekly_runs USING btree (parcours_id);

-- La clé primaire commence par `week_key` : les statistiques personnelles
-- (toutes les semaines d'une personne) ont besoin de cet index.
CREATE INDEX IF NOT EXISTS idx_weekly_runs_user
  ON weekly_runs USING btree (user_number);

-- ---------------------------------------------------------------------------
-- Mise à jour automatique de updated_at
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_weekly_runs_touch ON weekly_runs;
CREATE TRIGGER trg_weekly_runs_touch
  BEFORE UPDATE ON weekly_runs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE weekly_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_runs_lire      ON weekly_runs;
DROP POLICY IF EXISTS weekly_runs_inserer   ON weekly_runs;
DROP POLICY IF EXISTS weekly_runs_modifier  ON weekly_runs;
DROP POLICY IF EXISTS weekly_runs_supprimer ON weekly_runs;

CREATE POLICY weekly_runs_lire      ON weekly_runs FOR SELECT USING (true);
CREATE POLICY weekly_runs_inserer   ON weekly_runs FOR INSERT WITH CHECK (true);
CREATE POLICY weekly_runs_modifier  ON weekly_runs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY weekly_runs_supprimer ON weekly_runs FOR DELETE USING (true);

COMMIT;
