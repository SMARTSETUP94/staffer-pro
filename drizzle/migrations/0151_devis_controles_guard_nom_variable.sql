CREATE OR REPLACE FUNCTION public.devis_controles_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_ctl jsonb;
BEGIN
  IF NEW.statut_redaction IS DISTINCT FROM OLD.statut_redaction
    AND OLD.statut_redaction IN ('brouillon','a_valider') AND NEW.statut_redaction IN ('a_valider','valide') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Passage en % refusé : aucun utilisateur identifié (les contrôles avant validation exigent une action humaine ou un appel Claude authentifié)', NEW.statut_redaction USING ERRCODE='42501';
    END IF;
    v_ctl:=public.devis_controles_lire(OLD.id);
    IF (v_ctl->>'bloquants')::int>0 THEN RAISE EXCEPTION 'Contrôles bloquants' USING DETAIL=v_ctl::text; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.devis_controles_journal j WHERE j.devis_id=OLD.id
      AND j.cible=NEW.statut_redaction AND j.auteur=auth.uid() AND j.transaction_id=txid_current()
      AND j.empreinte=v_ctl->>'empreinte'
      AND ((v_ctl->>'avertissements')::int=0 OR j.avertissements_confirmes)) THEN
      IF (v_ctl->>'avertissements')::int>0 THEN RAISE EXCEPTION 'Confirmez les avertissements avant de poursuivre' USING DETAIL=v_ctl::text; END IF;
      INSERT INTO public.devis_controles_journal(devis_id,cible,empreinte,controles,auteur,source,transaction_id)
      VALUES(OLD.id,NEW.statut_redaction,v_ctl->>'empreinte',v_ctl,auth.uid(),
        CASE WHEN auth.jwt()->>'client_id' IS NOT NULL THEN 'mcp' ELSE 'application' END,txid_current());
    END IF;
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.devis_controles_guard() FROM PUBLIC,anon,authenticated;