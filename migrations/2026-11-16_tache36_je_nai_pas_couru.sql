-- =============================================================================
-- HappyRunners — « je n'ai pas couru » en base (tâche 36)
-- =============================================================================
-- Réponse explicite d'une personne pour un mercredi : « je n'ai pas couru ».
--
--   - Jusqu'ici la réponse vivait dans le `localStorage` de l'appareil. En
--     changeant de téléphone, le rappel de l'accueil revenait alors que la
--     personne avait déjà répondu. Cette table porte la réponse par PERSONNE,
--     pas par appareil.
--   - Clé primaire `(week_key, user_number)` : une seule réponse par personne
--     et par semaine. Répondre deux fois ne crée pas de doublon.
--   - Ce n'est PAS `attendances.status = 'skip'`. Une présence « skip » dit
--     « pas cette semaine » : une intention, avant le run. Cette table dit
--     « j'ai couru ? non » : un fait, après. Les deux peuvent coexister.
--   - La ligne ne crée aucune sortie et n'entre dans aucun total de km. Elle
--     coupe le rappel de l'accueil et, plus tard, distinguera un silence d'une
--     absence déclarée dans une ligue.
--   - Déclarer une sortie efface la réponse de la semaine, et une réponse ne
--     s'enregistre pas si une sortie existe déjà : on ne peut pas avoir couru
--     ET déclaré ne pas avoir couru.
--   - `ON DELETE CASCADE` sur `user_number` : supprimer un profil emporte ses
--     réponses, comme ses sorties.
--
-- RLS ouverte comme le reste du projet : il n'y a pas d'authentification
-- serveur (§6 de la cartographie).
--
-- Rejouable : `IF NOT EXISTS` / `DROP ... IF EXISTS` partout.
-- À appliquer d'abord sur la base de TEST, puis sur la prod après validation.
-- Dépend de `weekly_runs`, créée par la migration de la tâche 35.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Table : weekly_run_skips
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_run_skips (
  week_key     text    NOT NULL,
  user_number  integer NOT NULL
                 REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  declared_at  timestamptz NOT NULL DEFAULT now(),
  -- Une seule réponse par personne et par semaine.
  PRIMARY KEY (week_key, user_number)
);

-- La clé primaire commence par `week_key` : les statistiques personnelles
-- (toutes les réponses d'une personne) ont besoin de cet index.
CREATE INDEX IF NOT EXISTS idx_weekly_run_skips_user
  ON weekly_run_skips USING btree (user_number);

-- ---------------------------------------------------------------------------
-- Cohérence : une sortie déclarée l'emporte sur « je n'ai pas couru »
-- ---------------------------------------------------------------------------
-- Déclarer une sortie (ou la corriger) supprime la réponse de la semaine.
-- La règle vit en base : l'historique et l'accueil passent tous les deux par
-- `weekly_runs`, aucun client ne peut oublier de nettoyer.
CREATE OR REPLACE FUNCTION clear_run_skip_when_declared()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM weekly_run_skips
  WHERE week_key = NEW.week_key
    AND user_number = NEW.user_number;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS weekly_runs_clear_skip ON weekly_runs;
CREATE TRIGGER weekly_runs_clear_skip
  AFTER INSERT OR UPDATE ON weekly_runs
  FOR EACH ROW
  EXECUTE FUNCTION clear_run_skip_when_declared();

-- Sens inverse : une réponse tardive ne s'installe pas à côté d'une sortie
-- déjà déclarée. Elle est ignorée, jamais remplacée par une suppression de
-- sortie : effacer un fait serait pire que perdre une réponse.
CREATE OR REPLACE FUNCTION ignore_run_skip_when_run_exists()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM weekly_runs
    WHERE week_key = NEW.week_key
      AND user_number = NEW.user_number
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS weekly_run_skips_ignore_if_run ON weekly_run_skips;
CREATE TRIGGER weekly_run_skips_ignore_if_run
  BEFORE INSERT OR UPDATE ON weekly_run_skips
  FOR EACH ROW
  EXECUTE FUNCTION ignore_run_skip_when_run_exists();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE weekly_run_skips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_run_skips_lire      ON weekly_run_skips;
DROP POLICY IF EXISTS weekly_run_skips_inserer   ON weekly_run_skips;
DROP POLICY IF EXISTS weekly_run_skips_modifier  ON weekly_run_skips;
DROP POLICY IF EXISTS weekly_run_skips_supprimer ON weekly_run_skips;

CREATE POLICY weekly_run_skips_lire      ON weekly_run_skips FOR SELECT USING (true);
CREATE POLICY weekly_run_skips_inserer   ON weekly_run_skips FOR INSERT WITH CHECK (true);
CREATE POLICY weekly_run_skips_modifier  ON weekly_run_skips FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY weekly_run_skips_supprimer ON weekly_run_skips FOR DELETE USING (true);

COMMIT;
