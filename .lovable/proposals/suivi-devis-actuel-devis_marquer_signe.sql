CREATE OR REPLACE FUNCTION public.devis_marquer_signe(_devis_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; n int;
BEGIN
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Signature réservée à l''application' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM affaires WHERE id=d.affaire_id AND (statut_opportunite='gagne' OR phase='signe')) THEN
    RAISE EXCEPTION 'L''opportunité doit être gagnée'; END IF;
  IF d.statut_redaction NOT IN ('valide','transfere') THEN RAISE EXCEPTION 'Seul un devis validé ou envoyé peut être signé'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='signe', heures_be_fige=devis_heures_be(_devis_id), updated_at=now() WHERE id=_devis_id;
  UPDATE devis SET statut_redaction='refuse', updated_at=now()
   WHERE affaire_id=d.affaire_id AND id<>_devis_id AND redige_dans_staffing AND NOT est_modele
     AND statut_redaction IN ('brouillon','a_valider','valide','transfere');
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO opportunite_actions(affaire_id,type,texte,auteur_id)
  VALUES(d.affaire_id,'note_interne',format('Devis %s désigné comme signé ; %s autre(s) version(s) refusée(s)', d.numero, n), auth.uid());
  RETURN jsonb_build_object('devis_id',_devis_id,'refuses',n);
END $function$

