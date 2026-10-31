-- Coût et marge figés à la validation : rangés à part, jamais dans la ligne devis lisible par les chefs d'équipe.
CREATE TABLE public.devis_snapshot_couts (
  devis_id uuid PRIMARY KEY REFERENCES public.devis(id) ON DELETE CASCADE,
  cout_total numeric,
  marge jsonb,
  fige_le timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.devis_snapshot_couts TO service_role;
ALTER TABLE public.devis_snapshot_couts ENABLE ROW LEVEL SECURITY;

INSERT INTO public.devis_snapshot_couts(devis_id, cout_total, marge)
  SELECT id, (totaux_snapshot->>'cout_total')::numeric, totaux_snapshot->'marge' FROM public.devis
  WHERE redige_dans_staffing AND totaux_snapshot IS NOT NULL;
UPDATE public.devis SET totaux_snapshot = totaux_snapshot - 'cout_total' - 'marge'
  WHERE redige_dans_staffing AND totaux_snapshot IS NOT NULL;

CREATE OR REPLACE FUNCTION public.devis_statut_changer(_devis_id uuid, _statut devis_redaction_statut)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; v_calc jsonb;
BEGIN
  PERFORM devis_assert_ecriture(_devis_id, false);
  SELECT * INTO d FROM devis WHERE id=_devis_id FOR UPDATE;
  IF d.est_modele THEN RAISE EXCEPTION 'Un modèle n''a pas de statut'; END IF;
  IF _statut='a_valider' AND d.statut_redaction='brouillon' THEN
    UPDATE devis SET statut_redaction='a_valider', updated_at=now() WHERE id=_devis_id;
  ELSIF _statut='brouillon' AND d.statut_redaction='a_valider' THEN
    UPDATE devis SET statut_redaction='brouillon', updated_at=now() WHERE id=_devis_id;
  ELSIF _statut='valide' AND d.statut_redaction IN ('brouillon','a_valider') THEN
    IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Validation réservée au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
    v_calc := devis_calculer_interne(_devis_id);
    INSERT INTO devis_snapshot_couts(devis_id, cout_total, marge, fige_le)
      VALUES (_devis_id, (v_calc->>'cout_total')::numeric, v_calc->'marge', now())
      ON CONFLICT (devis_id) DO UPDATE SET cout_total=EXCLUDED.cout_total, marge=EXCLUDED.marge, fige_le=EXCLUDED.fige_le;
    UPDATE devis SET statut_redaction='valide', valide_par=auth.uid(), valide_le=now(), totaux_snapshot=v_calc - 'cout_total' - 'marge',
      montant_ht=(v_calc->>'total_ht')::numeric,
      dates_snapshot=(SELECT jsonb_build_object('date_opportunite',a.created_at::date,'date_devis',d.date_devis,
         'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,'date_evenement_debut',a.date_evenement_debut,
         'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage) FROM affaires a WHERE a.id=d.affaire_id),
      updated_at=now()
    WHERE id=_devis_id;
  ELSIF _statut='refuse' AND d.statut_redaction IN ('a_valider','valide','transfere') THEN
    IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Refus réservé à l''application' USING ERRCODE='42501'; END IF;
    IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
    UPDATE devis SET statut_redaction='refuse', updated_at=now() WHERE id=_devis_id;
  ELSE
    RAISE EXCEPTION 'Transition non autorisée : % → %', d.statut_redaction, _statut;
  END IF;
END $function$;

-- Lecture directe des devis Staffing : uniquement ceux que l'utilisateur a le droit de lire.
DROP POLICY IF EXISTS devis_staffing_lecture_couts ON public.devis;
CREATE POLICY devis_staffing_lecture_restreinte ON public.devis
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT redige_dans_staffing OR public.current_user_has_capability('devis.couts') OR public.devis_peut_lire(id));