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
-- Table : messages
-- ---------------------------------------------------------------------------
-- Fil de discussion du groupe.
--
-- ⚠️ Pas de `week_key` : la fenêtre de lecture est GLISSANTE (30 jours) et
--    calculée côté client à partir de `created_at`. Un message du mercredi
--    précédent reste donc visible le mardi suivant, puis sort tout seul.
--    Aucune suppression planifiée côté serveur : les clients purgent ce qui a
--    plus de 30 jours au chargement du chat.
--
-- Pas de `updated_at` : un message ne s'édite pas (aucune politique UPDATE).
CREATE TABLE IF NOT EXISTS messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_number integer NOT NULL REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  body        text    NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Réponse citée : lien vers l'original + instantané de son texte et de son
  -- auteur. L'instantané survit à la purge (le lien passe à NULL, pas le
  -- texte) et ne peut pas diverger : un message ne s'édite pas.
  reply_to_id          uuid REFERENCES messages(id) ON DELETE SET NULL,
  reply_to_body        text,
  reply_to_user_number integer REFERENCES user_profiles(user_number) ON DELETE SET NULL,
  CONSTRAINT messages_reply_body_length
    CHECK (reply_to_body IS NULL OR char_length(reply_to_body) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_messages_created
  ON messages USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON messages USING btree (reply_to_id);

-- ---------------------------------------------------------------------------
-- Table : message_reactions
-- ---------------------------------------------------------------------------
-- Une seule réaction par personne et par message : la clé primaire porte la
-- règle, pas l'interface. Réagir à nouveau met à jour la ligne (upsert).
--
-- `reaction` est une CLÉ (`like`, `love`…) et non un emoji : la palette
-- s'affiche côté client, donc la changer ne demande aucune migration, et le
-- CHECK interdit une valeur inventée.
--
-- Les deux clés étrangères sont en CASCADE : supprimer un message (ou un
-- profil) emporte ses réactions. La purge de 30 jours fait le ménage.
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id  uuid    NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_number integer NOT NULL REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  reaction    text    NOT NULL CHECK (reaction IN ('like', 'love', 'laugh', 'run', 'fire')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_number)
);

-- Le fil charge les réactions par relation imbriquée : sans cet index,
-- chaque message déclencherait un parcours complet de la table.
CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions USING btree (message_id);

-- ---------------------------------------------------------------------------
-- Table : push_subscriptions
-- ---------------------------------------------------------------------------
-- Un abonnement Web Push par appareil. `endpoint` est unique : se réabonner
-- sur le même téléphone met à jour la ligne au lieu d'en empiler une seconde.
-- Les clés `p256dh` et `auth` sont fournies par le navigateur ; elles ne
-- permettent pas de lire les messages, seulement de chiffrer la notification.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_number  integer NOT NULL REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions USING btree (user_number);

-- ---------------------------------------------------------------------------
-- Table : notification_preferences
-- ---------------------------------------------------------------------------
-- Une ligne par personne, un booléen par catégorie. Une ligne absente vaut
-- « tout activé » : l'abonnement push reste le vrai consentement, ces
-- réglages servent à couper une catégorie précise.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_number  integer PRIMARY KEY REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  messages     boolean NOT NULL DEFAULT true,
  run_reminder boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Table : weekly_runs
-- ---------------------------------------------------------------------------
-- Ce que chaque personne a RÉELLEMENT couru, une ligne par personne et par
-- mercredi passé. Le groupe ne fait pas toujours le même parcours.
--
-- Le vote (`participations`) dit ce que le groupe préférait ; cette table dit
-- ce qui a été fait, personne par personne. Les deux restent séparées : le
-- parcours gagnant d'un vote n'est jamais présenté comme un fait.
--
-- `parcours_name`, `distance_km` et `elevation_gain_m` sont des INSTANTANÉS
-- pris à la déclaration : renommer, modifier ou supprimer un parcours ne
-- réécrit pas les totaux d'une ligue passée. `parcours_id` reste un lien
-- facultatif vers le tracé (`ON DELETE SET NULL`).
--
-- Une sortie « autre » a `parcours_id` NULL et son libellé libre dans
-- `parcours_name`. Sa distance reste NULL : on ne compte que le connu.
--
-- `source` prépare la preuve de tracé : `manual` aujourd'hui, `gpx` puis
-- `strava` quand elle existera. Aucune de ces sources n'est encore écrite.
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
-- Table : weekly_run_skips
-- ---------------------------------------------------------------------------
-- Réponse explicite « je n'ai pas couru » pour un mercredi, par PERSONNE et
-- non par appareil : elle suit la personne d'un téléphone à l'autre.
--
-- Ce n'est pas `attendances.status = 'skip'`. Une présence « skip » dit « pas
-- cette semaine » (une intention, avant le run) ; cette table dit « j'ai couru
-- ? non » (un fait, après). Les deux peuvent coexister.
--
-- La ligne ne crée aucune sortie et n'entre dans aucun total de km. Elle coupe
-- le rappel de l'accueil et, plus tard, distinguera un silence d'une absence
-- déclarée dans une ligue.
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
-- Historique : pas de trigger de présence, volontairement
-- ---------------------------------------------------------------------------
-- La tâche 35 a d'abord imposé `attendances.status = 'going'` pour confirmer
-- le parcours du groupe. Le modèle est devenu « une sortie par personne » :
-- chacun déclare la sienne, et l'application remet sa présence à « going »
-- pour la semaine au moment de la déclaration. Exiger la présence *avant*
-- la déclaration bloquerait précisément les personnes qui ont couru sans
-- avoir répondu, cas explicitement accepté.
--
-- La cohérence est donc tenue côté application (`declareWeeklyRun` écrit la
-- présence puis la sortie) : il n'y a pas d'authentification serveur qui
-- permettrait de vérifier « c'est bien moi », un trigger ne protégerait rien.

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

DROP TRIGGER IF EXISTS trg_push_subscriptions_touch ON push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_touch
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_notification_preferences_touch ON notification_preferences;
CREATE TRIGGER trg_notification_preferences_touch
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_weekly_runs_touch ON weekly_runs;
CREATE TRIGGER trg_weekly_runs_touch
  BEFORE UPDATE ON weekly_runs
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

ALTER TABLE user_profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcours                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendances              ENABLE ROW LEVEL SECURITY;
ALTER TABLE participations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_runs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_run_skips         ENABLE ROW LEVEL SECURITY;

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

-- Messages : lire, écrire, supprimer — mais JAMAIS modifier. L'absence de
-- politique UPDATE rend un message immuable, pas seulement dans l'interface.
DROP POLICY IF EXISTS messages_lire      ON messages;
DROP POLICY IF EXISTS messages_inserer   ON messages;
DROP POLICY IF EXISTS messages_supprimer ON messages;

CREATE POLICY messages_lire      ON messages FOR SELECT USING (true);
CREATE POLICY messages_inserer   ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY messages_supprimer ON messages FOR DELETE USING (true);

-- Réactions : quatre politiques, UPDATE comprise. L'upsert
-- `ON CONFLICT DO UPDATE` en a besoin pour changer d'emoji.
DROP POLICY IF EXISTS message_reactions_lire      ON message_reactions;
DROP POLICY IF EXISTS message_reactions_inserer   ON message_reactions;
DROP POLICY IF EXISTS message_reactions_modifier  ON message_reactions;
DROP POLICY IF EXISTS message_reactions_supprimer ON message_reactions;

CREATE POLICY message_reactions_lire      ON message_reactions FOR SELECT USING (true);
CREATE POLICY message_reactions_inserer   ON message_reactions FOR INSERT WITH CHECK (true);
CREATE POLICY message_reactions_modifier  ON message_reactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY message_reactions_supprimer ON message_reactions FOR DELETE USING (true);

-- Abonnements push : aucune donnée sensible pour le groupe, mais la clé
-- privée VAPID et le secret du webhook ne sont PAS dans ces lignes.
DROP POLICY IF EXISTS push_subscriptions_lire      ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_inserer   ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_modifier  ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_supprimer ON push_subscriptions;

CREATE POLICY push_subscriptions_lire      ON push_subscriptions FOR SELECT USING (true);
CREATE POLICY push_subscriptions_inserer   ON push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY push_subscriptions_modifier  ON push_subscriptions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY push_subscriptions_supprimer ON push_subscriptions FOR DELETE USING (true);

DROP POLICY IF EXISTS notification_preferences_lire      ON notification_preferences;
DROP POLICY IF EXISTS notification_preferences_inserer   ON notification_preferences;
DROP POLICY IF EXISTS notification_preferences_modifier  ON notification_preferences;
DROP POLICY IF EXISTS notification_preferences_supprimer ON notification_preferences;

CREATE POLICY notification_preferences_lire      ON notification_preferences FOR SELECT USING (true);
CREATE POLICY notification_preferences_inserer   ON notification_preferences FOR INSERT WITH CHECK (true);
CREATE POLICY notification_preferences_modifier  ON notification_preferences FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY notification_preferences_supprimer ON notification_preferences FOR DELETE USING (true);

-- Historique : quatre politiques, UPDATE comprise. Corriger une confirmation
-- est un upsert `ON CONFLICT DO UPDATE` ; sans politique UPDATE, seul le
-- premier enregistrement passerait.
DROP POLICY IF EXISTS weekly_runs_lire      ON weekly_runs;
DROP POLICY IF EXISTS weekly_runs_inserer   ON weekly_runs;
DROP POLICY IF EXISTS weekly_runs_modifier  ON weekly_runs;
DROP POLICY IF EXISTS weekly_runs_supprimer ON weekly_runs;

CREATE POLICY weekly_runs_lire      ON weekly_runs FOR SELECT USING (true);
CREATE POLICY weekly_runs_inserer   ON weekly_runs FOR INSERT WITH CHECK (true);
CREATE POLICY weekly_runs_modifier  ON weekly_runs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY weekly_runs_supprimer ON weekly_runs FOR DELETE USING (true);

-- « Je n'ai pas couru » : quatre politiques comme les autres tables. L'upsert
-- du client est un `ON CONFLICT DO NOTHING`, mais une réponse peut être
-- réécrite un jour (annulation) sans redemander une migration.
DROP POLICY IF EXISTS weekly_run_skips_lire      ON weekly_run_skips;
DROP POLICY IF EXISTS weekly_run_skips_inserer   ON weekly_run_skips;
DROP POLICY IF EXISTS weekly_run_skips_modifier  ON weekly_run_skips;
DROP POLICY IF EXISTS weekly_run_skips_supprimer ON weekly_run_skips;

CREATE POLICY weekly_run_skips_lire      ON weekly_run_skips FOR SELECT USING (true);
CREATE POLICY weekly_run_skips_inserer   ON weekly_run_skips FOR INSERT WITH CHECK (true);
CREATE POLICY weekly_run_skips_modifier  ON weekly_run_skips FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY weekly_run_skips_supprimer ON weekly_run_skips FOR DELETE USING (true);


-- =============================================================================
-- Tables héritées à supprimer
-- =============================================================================
-- `profiles` et `responses` datent de l'ancien identifiant dérivé du nom
-- (local_user_id). Plus aucune ligne de code ne les écrit ni les lit.
-- `responses` n'a même aucune politique RLS : elle est morte ET inaccessible.
DROP TABLE IF EXISTS responses;
DROP TABLE IF EXISTS profiles;