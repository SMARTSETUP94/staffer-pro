CREATE OR REPLACE FUNCTION public.devis_progbat_donnees(_devis_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; v jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND supprime_le IS NULL AND redige_dans_staffing AND NOT est_modele;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF d.statut_redaction NOT IN ('valide','transfere','signe') THEN RAISE EXCEPTION 'Seul un devis validé ou signé peut être exporté vers ProGBat'; END IF;
  v := devis_lire_client(_devis_id);
  RETURN v || jsonb_build_object(
    'numero_progbat', d.numero_progbat, 'remise_mode', coalesce(d.remise_mode,'aucune'), 'remise_valeur', d.remise_valeur,
    'heures', (SELECT coalesce(jsonb_object_agg(ligne_id, h),'{}'::jsonb) FROM (
       SELECT z.ligne_id, round(sum(z.h),2) h FROM (
         SELECT x.ligne_id, x.heures*CASE WHEN x.par_unite THEN coalesce(l.quantite,1) ELSE 1 END h
           FROM devis_heures x JOIN devis_lignes l ON l.id=x.ligne_id
          WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND x.supprime_le IS NULL
         UNION ALL
         SELECT x.ligne_id, coalesce(x.heures_info,0)*CASE WHEN x.par_unite THEN coalesce(l.quantite,1) ELSE 1 END
           FROM devis_lignes_libres x JOIN devis_lignes l ON l.id=x.ligne_id
          WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL AND x.supprime_le IS NULL AND coalesce(x.heures_info,0)<>0) z
       GROUP BY z.ligne_id HAVING sum(z.h)<>0) s));
END $function$;