-- =============================================================================
-- HappyRunners — migration 2026-11-02 (tâche 29)
-- =============================================================================
-- Ajoute le fil de discussion du groupe.
--
--   - fenêtre glissante de 30 jours, calculée côté client à partir de
--     `created_at` : aucune colonne `week_key`, aucune suppression planifiée
--     côté serveur (la purge est faite par les clients au chargement du chat) ;
--   - aucune politique UPDATE : un message ne s'édite pas, même en base ;
--   - la longueur est bornée en base (1 à 500 caractères), pas seulement dans
--     l'interface ;
--   - ON DELETE CASCADE : supprimer un profil emporte ses messages, comme ses
--     présences et ses votes.
--
-- Rejouable : `IF NOT EXISTS` / `DROP ... IF EXISTS` partout.
-- À appliquer d'abord sur la base de TEST, puis sur la prod après validation.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_number integer NOT NULL REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  body        text    NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- DESC : la requête utile est « les messages récents », jamais le plus ancien.
CREATE INDEX IF NOT EXISTS idx_messages_created
  ON messages USING btree (created_at DESC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_lire      ON messages;
DROP POLICY IF EXISTS messages_inserer   ON messages;
DROP POLICY IF EXISTS messages_supprimer ON messages;

CREATE POLICY messages_lire      ON messages FOR SELECT USING (true);
CREATE POLICY messages_inserer   ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY messages_supprimer ON messages FOR DELETE USING (true);

COMMIT;
