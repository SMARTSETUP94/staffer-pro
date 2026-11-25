-- Proposition (non appliquée) : dans devis_statut_changer, remplacer uniquement la branche « refuse »
--   ELSIF _statut='refuse' AND d.statut_redaction IN ('a_valider','valide','transfere') THEN
-- par :
  ELSIF _statut IN ('refuse','remplace') AND d.statut_redaction IN ('brouillon','a_valider','valide','transfere') THEN
    IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Changement réservé à l''application' USING ERRCODE='42501'; END IF;
    IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Droits insuffisants' USING ERRCODE='42501'; END IF;
    UPDATE devis SET statut_redaction=_statut, updated_at=now() WHERE id=_devis_id;
-- Le reste de la fonction est inchangé (redéfinition depuis la version actuelle en base).
