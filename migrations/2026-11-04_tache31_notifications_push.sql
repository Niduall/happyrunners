-- =============================================================================
-- HappyRunners — migration 2026-11-04 (tâche 31)
-- =============================================================================
-- Notifications push (Web Push standard, sans service tiers).
--
--   - `push_subscriptions` : un abonnement par appareil (endpoint + clés
--     fournies par le navigateur). L'endpoint est unique : se réabonner sur
--     le même appareil met à jour la ligne au lieu d'en créer une seconde.
--   - `notification_preferences` : une ligne par personne, un booléen par
--     catégorie. La personne choisit ce qu'elle reçoit, indépendamment de
--     l'appareil.
--
-- RLS ouverte comme le reste du projet : il n'y a pas d'authentification
-- serveur. L'application identifie les gens par nom + PIN côté client, ce qui
-- reste une dissuasion, pas une sécurité (§6 de la cartographie).
--
-- Rejouable : `IF NOT EXISTS` / `DROP ... IF EXISTS` partout.
-- À appliquer d'abord sur la base de TEST, puis sur la prod après validation.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Abonnements par appareil
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_number  integer NOT NULL REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- La requête d'envoi part d'un message : « tous les appareils de tout le
-- monde sauf l'auteur ». L'index sur user_number sert au nettoyage par profil.
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions USING btree (user_number);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_lire      ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_inserer   ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_modifier  ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_supprimer ON push_subscriptions;

CREATE POLICY push_subscriptions_lire      ON push_subscriptions FOR SELECT USING (true);
CREATE POLICY push_subscriptions_inserer   ON push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY push_subscriptions_modifier  ON push_subscriptions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY push_subscriptions_supprimer ON push_subscriptions FOR DELETE USING (true);

DROP TRIGGER IF EXISTS trg_push_subscriptions_touch ON push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_touch
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- Préférences par personne
-- ---------------------------------------------------------------------------
-- Valeurs par défaut : tout activé. L'abonnement lui-même reste un geste
-- explicite ; ces booléens servent ensuite à désactiver une catégorie.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_number  integer PRIMARY KEY REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  messages     boolean NOT NULL DEFAULT true,
  run_reminder boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_lire      ON notification_preferences;
DROP POLICY IF EXISTS notification_preferences_inserer   ON notification_preferences;
DROP POLICY IF EXISTS notification_preferences_modifier  ON notification_preferences;
DROP POLICY IF EXISTS notification_preferences_supprimer ON notification_preferences;

CREATE POLICY notification_preferences_lire      ON notification_preferences FOR SELECT USING (true);
CREATE POLICY notification_preferences_inserer   ON notification_preferences FOR INSERT WITH CHECK (true);
CREATE POLICY notification_preferences_modifier  ON notification_preferences FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY notification_preferences_supprimer ON notification_preferences FOR DELETE USING (true);

DROP TRIGGER IF EXISTS trg_notification_preferences_touch ON notification_preferences;
CREATE TRIGGER trg_notification_preferences_touch
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
