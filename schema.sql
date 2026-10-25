-- =============================================================================
-- HappyRunners — schéma de la base
-- =============================================================================
-- Source de vérité de la structure. Rejouable à l'identique sur une base vide.
--
--   supabase db reset          (CLI Supabase)
--   psql "<chaîne de connexion Postgres>"   (connexion directe)
--   SQL Editor du dashboard    (coller le contenu)
--
-- ⚠️ Après exécution, lancer `python3 backup.py restore <fichier>`
--    pour peupler la base.
--
-- Ce fichier décrit la STRUCTURE, pas les données : aucun nom de collègue,
-- aucun vote. Les données réelles vivent uniquement dans Supabase.
-- =============================================================================

-- La séquence est déclarée AVANT user_profiles : elle lui sert de défaut.
-- ⚠️ NE PAS OBLIER : c'est elle qui attribue les user_number. La perdre
--    rend user_profiles.user_number inutilisable.
CREATE SEQUENCE IF NOT EXISTS user_number_seq START WITH 1 INCREMENT BY 1;

-- ---------------------------------------------------------------------------
-- Table : user_profiles
-- ---------------------------------------------------------------------------
-- `user_number` est l'identifiant technique STABLE, attribué par la base.
-- Le nom est un simple libellé : le changer ne casse ni les votes ni le PIN.
-- C'est ce qui a remplacé l'ancien identifiant dérivé du nom.
CREATE TABLE IF NOT EXISTS user_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_number integer NOT NULL DEFAULT nextval('user_number_seq'::regclass),
  first_name  text   NOT NULL,
  last_name   text   NOT NULL,
  -- NULL = profil non protégé. Personne ne peut le réinitialiser.
  pin_hash    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Un seul profil par numéro : c'est cette contrainte qui garantit qu'un
-- vote ne peut pas se retrouver rattaché à deux personnes.
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_user_number_key
  ON user_profiles USING btree (user_number);

-- Un seul profil par nom, insensible à la casse : `findProfileByName` cherche
-- « paulin claudin » comme « Paulin Claudin ». Sans cette contrainte, deux
-- graphies créent deux comptes et la personne ne retrouve plus ses votes.
-- (`lower()` seulement : les espaces sont déjà normalisés côté client.)
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_name_key
  ON user_profiles USING btree (lower(first_name), lower(last_name));

-- ---------------------------------------------------------------------------
-- Table : parcours
-- ---------------------------------------------------------------------------
-- `points` : tracés GPX au format [{lat, lng, ele?, time?}, ...].
--
-- `created_by` : écrit à l'import (`useParcours.createParcours`), jamais lu
-- par l'application. Volontairement SANS clé étrangère : la prod n'en a pas,
-- et la valeur ne sert à rien tant qu'aucun écran n'affiche « importé par ».
CREATE TABLE IF NOT EXISTS parcours (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  description       text,
  distance_km       numeric NOT NULL DEFAULT 0,
  elevation_gain_m  numeric NOT NULL DEFAULT 0,
  points            jsonb  NOT NULL DEFAULT '[]'::jsonb,
  created_by        integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parcours_created
  ON parcours USING btree (created_at DESC);

-- ---------------------------------------------------------------------------
-- Table : attendances
-- ---------------------------------------------------------------------------
-- Réponse globale à la semaine : « je viens » ou « pas aujourd'hui ».
-- `week_key` = date du mercredi visé, au format YYYY-MM-DD.
CREATE TABLE IF NOT EXISTS attendances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key    text    NOT NULL,
  user_number integer NOT NULL REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  status      text    NOT NULL CHECK (status IN ('going', 'skip')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Une seule réponse par personne et par semaine → l'app peut upsert sans doublon.
CREATE UNIQUE INDEX IF NOT EXISTS attendances_week_key_user_number_key
  ON attendances USING btree (week_key, user_number);

-- Pas d'index séparé sur `week_key` : l'index unique
-- `attendances_week_key_user_number_key` commence déjà par cette colonne.

CREATE INDEX IF NOT EXISTS idx_attendances_user
  ON attendances USING btree (user_number);

-- ---------------------------------------------------------------------------
-- Table : participations
-- ---------------------------------------------------------------------------
-- Le parcours choisi, par personne et par semaine.
--
-- ⚠️ ON DELETE CASCADE est volontaire et non négociable : supprimer un parcours
--    emporte les votes qui le portaient. C'est ce que la confirmation de
--    suppression annonce à l'utilisateur (« N votes seront perdus »).
CREATE TABLE IF NOT EXISTS participations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcours_id uuid    NOT NULL REFERENCES parcours(id) ON DELETE CASCADE,
  user_number integer NOT NULL REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  week_key    text    NOT NULL,
  status      text    NOT NULL DEFAULT 'yes' CHECK (status IN ('yes', 'no')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- UN SEUL choix par personne et par semaine. C'est cette contrainte qui
-- empêche d'être compté sur deux parcours à la fois.
CREATE UNIQUE INDEX IF NOT EXISTS participations_user_number_week_key_key
  ON participations USING btree (user_number, week_key);

CREATE INDEX IF NOT EXISTS idx_participations_week
  ON participations USING btree (week_key);

CREATE INDEX IF NOT EXISTS idx_participations_parcours
  ON participations USING btree (parcours_id);

-- ---------------------------------------------------------------------------
-- Règle métier : un vote exige une présence « going »
-- ---------------------------------------------------------------------------
-- La règle était purement côté client : un vote pouvait exister sans présence
-- (vote orphelin #16 / 2026-10-14). Elle tient maintenant en base.
--
-- ⚠️ Comme les triggers touch_updated_at ci-dessous, ces triggers sont
--    actifs en production.
--
-- `FOR SHARE` verrouille la présence le temps du vote. Sans lui, deux
-- transactions concurrentes pourraient laisser un vote rattaché à une présence
-- devenue « skip ».
CREATE OR REPLACE FUNCTION require_going_attendance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM attendances
  WHERE week_key = NEW.week_key
    AND user_number = NEW.user_number
    AND status = 'going'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Un vote exige une présence « going » (semaine %, personne %)',
      NEW.week_key, NEW.user_number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS participations_require_going ON participations;
CREATE TRIGGER participations_require_going
  BEFORE INSERT OR UPDATE ON participations
  FOR EACH ROW
  EXECUTE FUNCTION require_going_attendance();

CREATE OR REPLACE FUNCTION remove_vote_when_not_going()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_week_key text;
  v_user_number integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_week_key := OLD.week_key;
    v_user_number := OLD.user_number;
  ELSE
    v_week_key := NEW.week_key;
    v_user_number := NEW.user_number;
  END IF;

  DELETE FROM participations
  WHERE week_key = v_week_key
    AND user_number = v_user_number;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendances_remove_vote_when_not_going ON attendances;
CREATE TRIGGER attendances_remove_vote_when_not_going
  AFTER UPDATE OF status ON attendances
  FOR EACH ROW
  WHEN (NEW.status <> 'going')
  EXECUTE FUNCTION remove_vote_when_not_going();

DROP TRIGGER IF EXISTS attendances_remove_vote_on_delete ON attendances;
CREATE TRIGGER attendances_remove_vote_on_delete
  AFTER DELETE ON attendances
  FOR EACH ROW
  EXECUTE FUNCTION remove_vote_when_not_going();

-- ---------------------------------------------------------------------------
-- Mise à jour automatique de updated_at
-- ---------------------------------------------------------------------------
-- `castWeekVote()` et `setAttendance()` font un upsert sans toucher
-- `updated_at` : re-voter ou changer de présence laissait la colonne figée à
-- la création. Le trigger la remet à `now()` à chaque UPDATE, en base, donc
-- quel que soit le client.
--
-- `updateParcours()` continue d'écrire `updated_at` explicitement : le trigger
-- l'écrase de toute façon avec la même valeur, mais l'app reste correcte si
-- elle tourne contre une base où la migration n'est pas encore passée.
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

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- ⚠️ Tout est ouvert à `true` : aucune authentification serveur n'existe.
--    L'application identifie les personnes par nom + PIN côté client, ce qui
--    est une dissuasion et NON une sécurité.
--
--    Conséquence : quiconque possède l'URL et la clé anon peut lire et écrire
--    toutes les tables. Acceptable pour un club entre collègues ; à revoir si
--    l'app sort du groupe (cf. README § Sécurité).
-- =============================================================================

ALTER TABLE user_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcours       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendances    ENABLE ROW LEVEL SECURITY;
ALTER TABLE participations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profils_lire      ON user_profiles;
DROP POLICY IF EXISTS profils_inserer   ON user_profiles;
DROP POLICY IF EXISTS profils_modifier  ON user_profiles;
DROP POLICY IF EXISTS profils_supprimer ON user_profiles;

CREATE POLICY profils_lire      ON user_profiles FOR SELECT USING (true);
CREATE POLICY profils_inserer   ON user_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY profils_modifier  ON user_profiles FOR UPDATE USING (true);
CREATE POLICY profils_supprimer ON user_profiles FOR DELETE USING (true);

DROP POLICY IF EXISTS parcours_lire      ON parcours;
DROP POLICY IF EXISTS parcours_inserer   ON parcours;
DROP POLICY IF EXISTS parcours_modifier  ON parcours;
DROP POLICY IF EXISTS parcours_supprimer ON parcours;

CREATE POLICY parcours_lire      ON parcours FOR SELECT USING (true);
CREATE POLICY parcours_inserer   ON parcours FOR INSERT WITH CHECK (true);
CREATE POLICY parcours_modifier  ON parcours FOR UPDATE USING (true);
CREATE POLICY parcours_supprimer ON parcours FOR DELETE USING (true);

DROP POLICY IF EXISTS attendances_lire      ON attendances;
DROP POLICY IF EXISTS attendances_inserer   ON attendances;
DROP POLICY IF EXISTS attendances_modifier  ON attendances;
DROP POLICY IF EXISTS attendances_supprimer ON attendances;

CREATE POLICY attendances_lire      ON attendances FOR SELECT USING (true);
CREATE POLICY attendances_inserer   ON attendances FOR INSERT WITH CHECK (true);
CREATE POLICY attendances_modifier  ON attendances FOR UPDATE USING (true);
CREATE POLICY attendances_supprimer ON attendances FOR DELETE USING (true);

DROP POLICY IF EXISTS participations_lire      ON participations;
DROP POLICY IF EXISTS participations_inserer   ON participations;
DROP POLICY IF EXISTS participations_modifier  ON participations;
DROP POLICY IF EXISTS participations_supprimer ON participations;

CREATE POLICY participations_lire      ON participations FOR SELECT USING (true);
CREATE POLICY participations_inserer   ON participations FOR INSERT WITH CHECK (true);
CREATE POLICY participations_modifier  ON participations FOR UPDATE USING (true);
CREATE POLICY participations_supprimer ON participations FOR DELETE USING (true);

-- =============================================================================
-- Tables héritées à supprimer
-- =============================================================================
-- `profiles` et `responses` datent de l'ancien identifiant dérivé du nom
-- (local_user_id). Plus aucune ligne de code ne les écrit ni les lit.
-- `responses` n'a même aucune politique RLS : elle est morte ET inaccessible.
DROP TABLE IF EXISTS responses;
DROP TABLE IF EXISTS profiles;