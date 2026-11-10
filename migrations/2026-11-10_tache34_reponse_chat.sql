-- =============================================================================
-- HappyRunners — répondre à un message (tâche 34)
-- =============================================================================
-- Un message peut citer un autre message. L'aperçu de la citation est
-- **recopié** au moment de l'envoi :
--
--   - `reply_to_id` garde le lien vers l'original, pour plus tard ;
--   - `reply_to_body` et `reply_to_user_number` sont un instantané. Un message
--     n'étant jamais modifié, l'instantané ne peut pas diverger. Il survit à
--     la purge des 30 jours : l'aperçu reste lisible même quand l'original a
--     disparu (le lien passe alors à NULL, pas le texte).
--
-- Les deux clés étrangères sont en `ON DELETE SET NULL` : supprimer un
-- message ou un profil ne doit jamais emporter les réponses qui le citent.
--
-- RLS inchangée : les colonnes vivent dans `messages`, qui n'a toujours
-- aucune politique UPDATE (un message ne s'édite pas).
--
-- Rejouable : `IF NOT EXISTS` et contraintes ajoutées sous condition.
-- À appliquer d'abord sur la base de TEST, puis sur la prod après validation.
-- =============================================================================

BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id          uuid,
  ADD COLUMN IF NOT EXISTS reply_to_body        text,
  ADD COLUMN IF NOT EXISTS reply_to_user_number integer;

-- `ADD CONSTRAINT` n'accepte pas `IF NOT EXISTS` : on teste le catalogue.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_reply_to_id_fkey'
      AND conrelid = 'messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_reply_to_id_fkey
      FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_reply_to_user_number_fkey'
      AND conrelid = 'messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_reply_to_user_number_fkey
      FOREIGN KEY (reply_to_user_number)
      REFERENCES user_profiles(user_number) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_reply_body_length'
      AND conrelid = 'messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_reply_body_length
      CHECK (reply_to_body IS NULL OR char_length(reply_to_body) BETWEEN 1 AND 500);
  END IF;
END $$;

-- La purge des 30 jours supprime des messages : sans index, chaque suppression
-- ferait un parcours complet pour retrouver les réponses à détacher.
CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON messages USING btree (reply_to_id);

COMMIT;
