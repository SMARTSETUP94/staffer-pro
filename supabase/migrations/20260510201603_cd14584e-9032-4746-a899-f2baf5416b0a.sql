-- v0.45 Sprint A — Étape 1/2 : ajouter le membre d'enum `chef_metier_scoped`.
-- Cette migration doit être committée AVANT que la valeur soit référencée
-- dans une policy/fonction (contrainte Postgres ALTER TYPE ADD VALUE).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'chef_metier_scoped'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'chef_metier_scoped';
  END IF;
END $$;