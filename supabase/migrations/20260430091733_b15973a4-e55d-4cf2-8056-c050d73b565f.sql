-- v0.28.1 — Bloque la suppression d'une opportunité signée ou terminée
-- (l'admin peut bypass via une opération séparée; ici on protège l'historique métier)

CREATE OR REPLACE FUNCTION public.prevent_delete_signed_opportunite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On bloque la suppression si :
  --  • l'affaire a été signée (statut_opportunite = 'gagne' ET phase = 'signe')
  --  • OU le statut_opportunite est 'termine'
  -- Admin peut tout sauf si phase = 'signe' (préserver l'historique).
  IF OLD.statut_opportunite = 'termine' THEN
    RAISE EXCEPTION 'Impossible de supprimer une opportunité terminée. Conservez l''historique.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.phase = 'signe' AND OLD.statut_opportunite = 'gagne' THEN
    RAISE EXCEPTION 'Impossible de supprimer une opportunité signée. Modifiez le statut en "Perdu" ou archivez l''affaire.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_signed_opportunite ON public.affaires;
CREATE TRIGGER trg_prevent_delete_signed_opportunite
  BEFORE DELETE ON public.affaires
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_signed_opportunite();