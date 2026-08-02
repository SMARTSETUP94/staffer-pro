-- pgTAP — LOT B1/B2 : règle de complétude et validation d'étape
--   psql -f supabase/tests/etape_prete.spec.sql
-- Tout s'exécute dans une transaction ROLLBACK : aucune donnée persistée.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
\i supabase/tests/_helpers.sql

SELECT plan(10);

-- ---------------------------------------------------------------- Fixtures
DO $$
DECLARE
  v_affaire uuid;
  v_objet uuid;
  v_admin uuid := '00000000-0000-0000-0000-0000000000b1';
  v_respo uuid := '00000000-0000-0000-0000-0000000000b2';
BEGIN
  SELECT id INTO v_affaire FROM public.affaires LIMIT 1;
  IF v_affaire IS NULL THEN
    RAISE EXCEPTION 'Fixture manquante : au moins 1 affaire requise.';
  END IF;

  INSERT INTO public.fabrication_objets (affaire_id, reference, nom, quantite, est_brut)
  VALUES (v_affaire, 'TEST-B1', 'Objet pgTAP LOT B', 1, false)
  RETURNING id INTO v_objet;

  -- Étapes : on part d'une table vierge pour cet objet.
  DELETE FROM public.fabrication_etapes WHERE objet_id = v_objet;
  INSERT INTO public.fabrication_etapes (objet_id, type_etape, statut) VALUES
    (v_objet, 'be', 'a_faire'),
    (v_objet, 'usinage', 'a_faire'),
    (v_objet, 'respo_fab', 'a_faire'),
    (v_objet, 'finition', 'a_faire'),
    (v_objet, 'manutention', 'a_faire');

  PERFORM set_config('test.objet_id', v_objet::text, false);
  PERFORM set_config('test.affaire_id', v_affaire::text, false);
  PERFORM set_config('test.admin_id', v_admin::text, false);
  PERFORM set_config('test.respo_id', v_respo::text, false);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.etape(_type public.fabrication_etape_type)
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.fabrication_etapes
   WHERE objet_id = current_setting('test.objet_id')::uuid AND type_etape = _type;
$$;

-- ------------------------------------------------------------ B1 : etape_prete
SELECT is(
  (public.etape_prete(pg_temp.etape('be')) ->> 'prete')::boolean,
  true,
  'be : aucun prérequis, toujours prête'
);

SELECT is(
  (public.etape_prete(pg_temp.etape('usinage')) ->> 'prete')::boolean,
  false,
  'usinage sans plan publié : non prête'
);

SELECT is(
  public.etape_prete(pg_temp.etape('usinage')) -> 'manques' ->> 0,
  'Plan technique non publié',
  'usinage : libellé de manque explicite'
);

UPDATE public.fabrication_objets
   SET plan_url = 'https://example.test/plan.pdf'
 WHERE id = current_setting('test.objet_id')::uuid;

SELECT is(
  (public.etape_prete(pg_temp.etape('respo_fab')) ->> 'prete')::boolean,
  true,
  'respo_fab : prête dès que le plan est publié'
);

SELECT is(
  public.etape_prete(pg_temp.etape('finition')) -> 'manques' ->> 0,
  'Type de finition manquant',
  'finition : type_finition absent est signalé'
);

UPDATE public.fabrication_objets
   SET type_finition = 'peinture', est_brut = true
 WHERE id = current_setting('test.objet_id')::uuid;

SELECT is(
  (public.etape_prete(pg_temp.etape('finition')) ->> 'prete')::boolean,
  true,
  'finition : est_brut dispense du détail de finition'
);

SELECT is(
  public.etape_prete(pg_temp.etape('manutention')) -> 'manques' ->> 0,
  'Dimensions finales manquantes',
  'manutention : dimensions incomplètes signalées'
);

UPDATE public.fabrication_etapes SET statut = 'non_applicable'
 WHERE id = pg_temp.etape('manutention');

SELECT is(
  (public.etape_prete(pg_temp.etape('manutention')) ->> 'prete')::boolean,
  true,
  'non_applicable : toujours prête'
);

-- ------------------------------------------------------- B1 : batch
SELECT is(
  (SELECT count(*)::int FROM public.etapes_pretes_batch(
     ARRAY[current_setting('test.objet_id')::uuid])),
  5,
  'etapes_pretes_batch renvoie une ligne par étape'
);

-- ------------------------------------------------- B2 : valider_etape (droits)
DO $$
BEGIN
  UPDATE public.fabrication_objets
     SET respo_fab_id = NULL
   WHERE id = current_setting('test.objet_id')::uuid;
END $$;

SELECT test_helpers.login_as(current_setting('test.respo_id')::uuid);

SELECT is(
  (public.valider_etape(pg_temp.etape('be')) ->> 'ok')::boolean,
  false,
  'valider_etape : refus sans droit, sans lever d''exception'
);

SELECT * FROM finish();
ROLLBACK;
