-- =============================================================================
-- HappyRunners — lier une montre (tâche 37)
-- =============================================================================
-- Le téléphone pousse, l'application reçoit. Au lieu de demander à chacun
-- d'aller exporter un fichier GPX chaque semaine, une petite application du
-- téléphone (Health Connect Webhook sur Android, Health Webhook ou un
-- Raccourci sur iPhone) lit le store de santé du téléphone et poste les
-- séances d'entraînement à une adresse personnelle.
--
--   - `device_links` : un lien par personne. On ne stocke que l'**empreinte**
--     SHA-256 du jeton, jamais le jeton lui-même. Une fuite de la table ne
--     permet donc pas de poster des sorties. Le jeton en clair ne vit que sur
--     le téléphone de la personne (localStorage) et dans l'application de
--     santé qui l'envoie.
--   - `import_proposals` : ce que la montre a proposé. **Rien n'entre dans le
--     classement sans validation** : la ligne reste `pending` tant que la
--     personne n'a pas cliqué « Valider ». C'est la règle du projet (la
--     synchro propose, la personne valide).
--   - `external_id` : l'heure de début de la séance, telle que fournie par le
--     téléphone. La contrainte d'unicité `(user_number, external_id)` évite
--     qu'une synchronisation toutes les 15 minutes crée cinquante doublons
--     de la même course.
--   - **Pas de `week_key` ici** : la règle du mercredi 14h vit dans
--     `weekKey.ts`, testée. La dupliquer en SQL créerait deux vérités.
--   - `weekly_runs.source` accepte désormais `health`, pour distinguer une
--     sortie validée depuis la montre d'une saisie manuelle ou d'un GPX.
--
-- RLS ouverte comme le reste du projet : il n'y a pas d'authentification
-- serveur (§6 de la cartographie). L'empreinte d'un jeton n'est pas un secret ;
-- en revanche, la personne qui connaît le jeton peut poster des sorties pour
-- ce profil, exactement comme elle pourrait déjà écrire une sortie avec la clé
-- anon. Ce n'est pas une authentification, c'est un tuyau.
--
-- Rejouable : `IF NOT EXISTS` / `DROP ... IF EXISTS` partout.
-- À appliquer d'abord sur la base de TEST, puis sur la prod après validation.
-- Dépend de `touch_updated_at()` (migration de la tâche 17) et de la table
-- `weekly_runs` (migration de la tâche 35) : appliquer après elles.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Table : device_links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_number integer NOT NULL
                REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  -- Libellé libre (« Montre », « iPhone de Paulin »). Un seul lien utile
  -- aujourd'hui, mais rien n'interdit d'en avoir plusieurs.
  label       text    NOT NULL DEFAULT 'Montre'
                CHECK (btrim(label) <> ''),
  -- SHA-256 hexadécimal du jeton (64 caractères). Jamais le jeton en clair.
  token_hash  text    NOT NULL UNIQUE
                CHECK (char_length(token_hash) = 64),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Dernière synchronisation reçue : sert à afficher « ça marche » ou
  -- « plus rien depuis 3 semaines ».
  last_seen_at timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_links_user
  ON device_links USING btree (user_number);

-- ---------------------------------------------------------------------------
-- Table : import_proposals
-- ---------------------------------------------------------------------------
-- Une ligne par séance proposée par le téléphone. `status` :
--   pending  → en attente de validation (ce que l'interface affiche)
--   accepted → validée, une sortie a été déclarée
--   ignored  → écartée par la personne
--
-- `distance_m` est en mètres (unité du payload Health Connect) ; l'interface
-- convertit en kilomètres. `duration_s` en secondes.
CREATE TABLE IF NOT EXISTS import_proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_number   integer NOT NULL
                  REFERENCES user_profiles(user_number) ON DELETE CASCADE,
  -- Toujours `health` aujourd'hui. La colonne existe pour que le jour où une
  -- deuxième source arrivera (FIT, Strava), l'interface sache d'où ça vient.
  source        text    NOT NULL DEFAULT 'health'
                  CHECK (source IN ('health')),
  -- Heure de début ISO 8601 envoyée par le téléphone : identifie la séance.
  external_id   text    NOT NULL CHECK (btrim(external_id) <> ''),
  -- RUNNING, WALKING, CYCLING… tel que fourni par Health Connect / HealthKit.
  activity_type text    NOT NULL DEFAULT 'RUNNING',
  started_at    timestamptz NOT NULL,
  duration_s    integer CHECK (duration_s IS NULL OR duration_s >= 0),
  distance_m    integer CHECK (distance_m IS NULL OR distance_m >= 0),
  status        text    NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'ignored')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- La même séance ne peut pas être proposée deux fois à la même personne.
  UNIQUE (user_number, external_id)
);

-- L'interface ne demande que les propositions en attente d'une personne.
CREATE INDEX IF NOT EXISTS idx_import_proposals_user_status
  ON import_proposals USING btree (user_number, status, started_at DESC);

-- ---------------------------------------------------------------------------
-- Mise à jour automatique de updated_at
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_device_links_touch ON device_links;
CREATE TRIGGER trg_device_links_touch
  BEFORE UPDATE ON device_links
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- weekly_runs.source : accepter `health`
-- ---------------------------------------------------------------------------
-- On retire la contrainte par son contenu, pas par son nom : la prod peut
-- l'avoir nommée autrement selon la façon dont la table a été créée.
DO $$
DECLARE
  existing record;
BEGIN
  FOR existing IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'weekly_runs'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE weekly_runs DROP CONSTRAINT %I', existing.conname);
  END LOOP;
END
$$;

ALTER TABLE weekly_runs
  ADD CONSTRAINT weekly_runs_source_check
  CHECK (source IN ('manual', 'gpx', 'strava', 'health'));

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE device_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_proposals  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_links_lire      ON device_links;
DROP POLICY IF EXISTS device_links_inserer   ON device_links;
DROP POLICY IF EXISTS device_links_modifier  ON device_links;
DROP POLICY IF EXISTS device_links_supprimer ON device_links;

CREATE POLICY device_links_lire      ON device_links FOR SELECT USING (true);
CREATE POLICY device_links_inserer   ON device_links FOR INSERT WITH CHECK (true);
CREATE POLICY device_links_modifier  ON device_links FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY device_links_supprimer ON device_links FOR DELETE USING (true);

DROP POLICY IF EXISTS import_proposals_lire      ON import_proposals;
DROP POLICY IF EXISTS import_proposals_inserer   ON import_proposals;
DROP POLICY IF EXISTS import_proposals_modifier  ON import_proposals;
DROP POLICY IF EXISTS import_proposals_supprimer ON import_proposals;

CREATE POLICY import_proposals_lire      ON import_proposals FOR SELECT USING (true);
CREATE POLICY import_proposals_inserer   ON import_proposals FOR INSERT WITH CHECK (true);
CREATE POLICY import_proposals_modifier  ON import_proposals FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY import_proposals_supprimer ON import_proposals FOR DELETE USING (true);

COMMIT;
