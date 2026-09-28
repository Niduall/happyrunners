-- Rendre created_by nullable
ALTER TABLE parcours ALTER COLUMN created_by DROP NOT NULL;

-- Mettre à jour les parcours existants sans created_by valide
UPDATE parcours SET created_by = NULL 
WHERE created_by IS NOT NULL 
  AND created_by::text NOT LIKE '________-____-____-____-____________';