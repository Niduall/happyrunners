-- =============================================================================
-- HappyRunners — migration 2026-10-25 (tâche 17)
-- =============================================================================
-- Trois changements de structure, à appliquer d'abord sur la base de TEST :
--
--   1. `updated_at` mis à jour automatiquement (parcours, attendances,
--      participations) — les upserts de vote et de présence ne l'écrivaient pas.
--   2. Unicité des noms insensible à la casse — deux graphies d'un même nom
--      créaient deux comptes.
--   3. Suppression de `idx_attendances_week`, redondant avec l'index unique
--      `(week_key, user_number)`.
--
-- Rejouable : `IF NOT EXISTS` / `OR REPLACE` / `DROP ... IF EXISTS` partout.
-- À appliquer dans le SQL Editor du dashboard Supabase (ou via psql).
--
-- ⚠️ Le bloc « unicité » REFUSE de s'exécuter s'il existe déjà deux profils
--    dont les noms ne diffèrent que par la casse. Il faut alors fusionner les
--    comptes à la main : la migration ne supprime jamais de données.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. updated_at automatique
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parcours_touch ON parcours;
CREATE TRIGGER trg_parcours_touch
  BEFORE UPDATE ON parcours
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_attendances_touch ON attendances;
CREATE TRIGGER trg_attendances_touch
  BEFORE UPDATE ON attendances
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_participations_touch ON participations;
CREATE TRIGGER trg_participations_touch
  BEFORE UPDATE ON participations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Unicité des noms (insensible à la casse)
-- ---------------------------------------------------------------------------
-- Garde-fou : on préfère un message lisible à l'erreur brute
-- « could not create unique index ».
DO $$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(nom || ' ×' || n, E'\n  ')
    INTO v_dups
  FROM (
    SELECT lower(first_name) || ' ' || lower(last_name) AS nom, count(*) AS n
    FROM user_profiles
    GROUP BY 1
    HAVING count(*) > 1
  ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION
      E'Migration arrêtée : noms en doublon (insensible à la casse) :\n  %\nFusionne ces profils, puis relance la migration.',
      v_dups;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_name_key
  ON user_profiles USING btree (lower(first_name), lower(last_name));

-- ---------------------------------------------------------------------------
-- 3. Index redondant
-- ---------------------------------------------------------------------------
-- `attendances_week_key_user_number_key` commence par `week_key` : l'index
-- simple ne servait à aucune requête que l'index unique ne couvre déjà.
DROP INDEX IF EXISTS idx_attendances_week;

COMMIT;
