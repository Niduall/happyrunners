-- =============================================================================
-- HappyRunners — réactions du chat (tâche 32)
-- =============================================================================
-- Permet de réagir à un message avec UN SEUL emoji par personne.
--
--   - La clé primaire `(message_id, user_number)` porte la règle : réagir à
--     nouveau met à jour la ligne (upsert) au lieu d'en ajouter une seconde.
--     C'est la base qui garantit « une réaction par personne », pas l'UI.
--   - `reaction` stocke une CLÉ (`like`, `love`…) et non l'emoji lui-même.
--     L'affichage (👍, ❤️…) vit dans `src/services/messages.ts` : changer la
--     palette ne demande aucune migration, et un CHECK protège la colonne.
--   - `ON DELETE CASCADE` : supprimer un message ou un profil emporte ses
--     réactions. Aucune purge dédiée n'est nécessaire, la purge des messages
--     (30 jours) fait le ménage.
--
-- RLS ouverte comme le reste du projet : il n'y a pas d'authentification
-- serveur (§6 de la cartographie).
--
-- Rejouable : `IF NOT EXISTS` / `DROP ... IF EXISTS` partout.
-- À appliquer d'abord sur la base de TEST, puis sur la prod après validation.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id  uuid    NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_number integer NOT NULL REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  reaction    text    NOT NULL CHECK (reaction IN ('like', 'love', 'laugh', 'run', 'fire')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_number)
);

-- Les messages sont lus avec leurs réactions (relation imbriquée) : l'index
-- évite un parcours complet à chaque chargement du fil.
CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions USING btree (message_id);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Quatre politiques, y compris UPDATE : l'upsert `ON CONFLICT DO UPDATE`
-- change d'emoji sans supprimer puis recréer la ligne (pas de trou visible
-- entre les deux requêtes).
DROP POLICY IF EXISTS message_reactions_lire      ON message_reactions;
DROP POLICY IF EXISTS message_reactions_inserer   ON message_reactions;
DROP POLICY IF EXISTS message_reactions_modifier  ON message_reactions;
DROP POLICY IF EXISTS message_reactions_supprimer ON message_reactions;

CREATE POLICY message_reactions_lire      ON message_reactions FOR SELECT USING (true);
CREATE POLICY message_reactions_inserer   ON message_reactions FOR INSERT WITH CHECK (true);
CREATE POLICY message_reactions_modifier  ON message_reactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY message_reactions_supprimer ON message_reactions FOR DELETE USING (true);

COMMIT;
