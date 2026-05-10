-- pgTAP — Triggers de bornes sur heures_saisies / assignations
-- Exécution :
--   psql -f supabase/tests/heures_saisies_bounds.sql
-- ou via pg_prove :
--   pg_prove -d "$DATABASE_URL" supabase/tests/heures_saisies_bounds.sql
--
-- L'ensemble s'exécute dans une transaction ROLLBACK : aucune donnée n'est persistée.
-- On utilise throws_like(...) pour matcher le préfixe métier HEURES_INVALIDES
-- (le SQLSTATE renvoyé par RAISE EXCEPTION est 23514/P0001 selon la version ;
-- la garantie applicative est le code métier porté dans le message).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(8);

-- Fixtures
DO $$
DECLARE
  v_employe uuid;
  v_affaire uuid;
BEGIN
  SELECT id INTO v_employe FROM public.employes LIMIT 1;
  SELECT id INTO v_affaire FROM public.affaires LIMIT 1;

  IF v_employe IS NULL OR v_affaire IS NULL THEN
    RAISE EXCEPTION 'Fixtures manquantes : besoin d''au moins 1 employé et 1 affaire en base.';
  END IF;

  PERFORM set_config('test.employe_id', v_employe::text, false);
  PERFORM set_config('test.affaire_id', v_affaire::text, false);
END $$;

-- ============================================================================
-- TRIGGER : validate_heures_saisies_bounds  → code métier HEURES_INVALIDES
-- ============================================================================

-- 1. heures_reelles = 25 → REJET
SELECT throws_like(
  format(
    $q$INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
       VALUES (%L, %L, CURRENT_DATE, 25, 0, 'brouillon')$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'HEURES_INVALIDES%',
  'heures_reelles=25 doit être rejeté avec code HEURES_INVALIDES'
);

-- 2. heures_reelles = -1 → REJET
SELECT throws_like(
  format(
    $q$INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
       VALUES (%L, %L, CURRENT_DATE, -1, 0, 'brouillon')$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'HEURES_INVALIDES%',
  'heures_reelles=-1 doit être rejeté avec code HEURES_INVALIDES'
);

-- 3. heures_nuit = 25 → REJET
SELECT throws_like(
  format(
    $q$INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
       VALUES (%L, %L, CURRENT_DATE, 8, 25, 'brouillon')$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'HEURES_INVALIDES%',
  'heures_nuit=25 doit être rejeté avec code HEURES_INVALIDES'
);

-- 4. heures_nuit > heures_reelles → REJET
SELECT throws_like(
  format(
    $q$INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
       VALUES (%L, %L, CURRENT_DATE, 4, 8, 'brouillon')$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'HEURES_INVALIDES%',
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

-- 7. heures_reelles = 24.01 (juste au-dessus de la borne) → REJET
SELECT throws_like(
  format(
    $q$INSERT INTO public.heures_saisies (employe_id, affaire_id, date, heures_reelles, heures_nuit, statut)
       VALUES (%L, %L, CURRENT_DATE - INTERVAL '3 days', 24.01, 0, 'brouillon')$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'HEURES_INVALIDES%',
  'heures_reelles=24.01 doit être rejeté avec code HEURES_INVALIDES (borne stricte)'
);

-- ============================================================================
-- TRIGGER : validate_assignation_heures → code métier HEURES_INVALIDES
-- ============================================================================

-- 8. assignation.heures = 26 → REJET
SELECT throws_like(
  format(
    $q$INSERT INTO public.assignations (employe_id, affaire_id, date, heures)
       VALUES (%L, %L, CURRENT_DATE - INTERVAL '4 days', 26)$q$,
    current_setting('test.employe_id'),
    current_setting('test.affaire_id')
  ),
  'HEURES_INVALIDES%',
  'assignation.heures=26 doit être rejeté avec code HEURES_INVALIDES'
);

SELECT * FROM finish();

ROLLBACK;
