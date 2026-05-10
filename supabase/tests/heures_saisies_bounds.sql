-- pgTAP — Triggers de bornes sur heures_saisies / assignations
-- Exécution :
--   psql -f supabase/tests/heures_saisies_bounds.sql
-- ou via pg_prove :
--   pg_prove -d "$DATABASE_URL" supabase/tests/heures_saisies_bounds.sql
--
-- L'ensemble s'exécute dans une transaction ROLLBACK : aucune donnée n'est persistée.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(8);

-- Fixtures : on récupère un employe et une affaire existants pour satisfaire les NOT NULL.
-- Si la base est vide, on insère un minimum.
DO $$
DECLARE
  v_employe uuid;
  v_affaire uuid;
BEGIN
  SELECT id INTO v_employe FROM public.employes LIMIT 1;
  SELECT id INTO v_affaire FROM public.affaires LIMIT 1;

  IF v_employe IS NULL OR v_affaire IS NULL THEN
    RAISE EXCEPTION 'Fixtures manquantes : besoin d''au moins 1 employé et 1 affaire en base pour exécuter ces tests pgTAP.';
  END IF;

  -- Stockage local pour les tests suivants
  PERFORM set_config('test.employe_id', v_employe::text, false);
  PERFORM set_config('test.affaire_id', v_affaire::text, false);
END $$;

-- ============================================================================
-- TRIGGER : validate_heures_saisies_bounds
-- Règles : heures_reelles ∈ [0,24], heures_nuit ∈ [0,24], heures_nuit ≤ heures_reelles
-- Code d'erreur attendu : HEURES_INVALIDES (SQLSTATE P0001 + ERRCODE personnalisé)
-- ============================================================================

-- 1. heures_reelles = 25 → REJET
SELECT throws_ok(
  format(
    $q$INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
       VALUES (%L, %L, CURRENT_DATE, 25, 0, 'brouillon')$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'HEURES_INVALIDES',
  'heures_reelles=25 doit être rejeté avec code HEURES_INVALIDES'
);

-- 2. heures_reelles = -1 → REJET
SELECT throws_ok(
  format(
    $q$INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
       VALUES (%L, %L, CURRENT_DATE, -1, 0, 'brouillon')$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'HEURES_INVALIDES',
  'heures_reelles=-1 doit être rejeté avec code HEURES_INVALIDES'
);

-- 3. heures_nuit = 25 → REJET
SELECT throws_ok(
  format(
    $q$INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
       VALUES (%L, %L, CURRENT_DATE, 8, 25, 'brouillon')$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'HEURES_INVALIDES',
  'heures_nuit=25 doit être rejeté avec code HEURES_INVALIDES'
);

-- 4. heures_nuit > heures_reelles → REJET
SELECT throws_ok(
  format(
    $q$INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
       VALUES (%L, %L, CURRENT_DATE, 4, 8, 'brouillon')$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'HEURES_INVALIDES',
  'heures_nuit > heures_reelles doit être rejeté avec code HEURES_INVALIDES'
);

-- 5. heures_reelles = 24 (borne haute incluse) → OK
SELECT lives_ok(
  format(
    $q$INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
       VALUES (%L, %L, CURRENT_DATE - INTERVAL '1 day', 24, 0, 'brouillon')$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'heures_reelles=24 doit être accepté (borne haute incluse)'
);

-- 6. heures_reelles = 0 (borne basse incluse) → OK
SELECT lives_ok(
  format(
    $q$INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
       VALUES (%L, %L, CURRENT_DATE - INTERVAL '2 days', 0, 0, 'brouillon')$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'heures_reelles=0 doit être accepté (borne basse incluse)'
);

-- 7. UPDATE qui pousse heures_reelles à 30 → REJET (le trigger est BEFORE INSERT OR UPDATE)
DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
  VALUES (
    current_setting('test.employe_id')::uuid,
    current_setting('test.affaire_id')::uuid,
    CURRENT_DATE - INTERVAL '3 days',
    8, 2, 'brouillon'
  )
  RETURNING id INTO v_id;
  PERFORM set_config('test.heures_id', v_id::text, false);
END $$;

SELECT throws_ok(
  format(
    $q$UPDATE public.heures_saisies SET heures_reelles = 30 WHERE id = %L$q$,
    current_setting('test.heures_id')
  ),
  'HEURES_INVALIDES',
  'UPDATE qui porte heures_reelles à 30 doit être rejeté avec code HEURES_INVALIDES'
);

-- ============================================================================
-- TRIGGER : validate_assignation_heures
-- Règle : heures ∈ [0,24]
-- ============================================================================

-- 8. assignation.heures = 26 → REJET
SELECT throws_ok(
  $q$INSERT INTO public.assignations (employe_id, affaire_id, date, heures)
     VALUES (
       current_setting('test.employe_id')::uuid,
       current_setting('test.affaire_id')::uuid,
       CURRENT_DATE - INTERVAL '4 days',
       26
     )$q$,
  'HEURES_INVALIDES',
  'assignation.heures=26 doit être rejeté avec code HEURES_INVALIDES'
);

SELECT * FROM finish();

ROLLBACK;
