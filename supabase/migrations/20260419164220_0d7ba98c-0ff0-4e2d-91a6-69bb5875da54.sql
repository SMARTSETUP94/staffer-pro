-- Table commentaires
CREATE TABLE public.affaire_commentaires (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affaire_id UUID NOT NULL,
  author_id UUID NOT NULL,
  body TEXT NOT NULL,
  mentions UUID[] NOT NULL DEFAULT '{}'::uuid[],
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_affaire_commentaires_affaire ON public.affaire_commentaires (affaire_id, created_at DESC);

ALTER TABLE public.affaire_commentaires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affaire_commentaires_select_chef_admin"
  ON public.affaire_commentaires FOR SELECT
  TO authenticated
  USING (is_chef_or_admin());

CREATE POLICY "affaire_commentaires_insert_chef_admin"
  ON public.affaire_commentaires FOR INSERT
  TO authenticated
  WITH CHECK (is_chef_or_admin() AND author_id = auth.uid());

CREATE POLICY "affaire_commentaires_update_self"
  ON public.affaire_commentaires FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "affaire_commentaires_delete_chef_admin"
  ON public.affaire_commentaires FOR DELETE
  TO authenticated
  USING (is_chef_or_admin());

CREATE TRIGGER update_affaire_commentaires_updated_at
BEFORE UPDATE ON public.affaire_commentaires
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger : mentions → notifications
CREATE OR REPLACE FUNCTION public.notify_mention()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mentioned UUID;
  _author RECORD;
  _affaire RECORD;
  _excerpt TEXT;
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT full_name, email INTO _author FROM public.profiles WHERE id = NEW.author_id;
  SELECT numero, nom INTO _affaire FROM public.affaires WHERE id = NEW.affaire_id;
  _excerpt := substring(NEW.body FROM 1 FOR 120);
  IF length(NEW.body) > 120 THEN _excerpt := _excerpt || '…'; END IF;

  FOREACH _mentioned IN ARRAY NEW.mentions LOOP
    -- Ne pas notifier l'auteur lui-même
    IF _mentioned <> NEW.author_id THEN
      PERFORM public.create_notification(
        _mentioned,
        'mention'::public.notification_type,
        format('%s vous a mentionné', COALESCE(_author.full_name, _author.email, 'Quelqu''un')),
        format('Sur %s — %s : %s', COALESCE(_affaire.numero, '?'), COALESCE(_affaire.nom, ''), _excerpt),
        '/affaires/' || NEW.affaire_id::text,
        jsonb_build_object('affaire_id', NEW.affaire_id, 'commentaire_id', NEW.id)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_mention
AFTER INSERT ON public.affaire_commentaires
FOR EACH ROW EXECUTE FUNCTION public.notify_mention();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.affaire_commentaires;

-- Bucket privé pour pièces jointes
INSERT INTO storage.buckets (id, name, public)
VALUES ('affaire-attachments', 'affaire-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Policies storage : chefs/admins uniquement
CREATE POLICY "affaire_attachments_select_chef_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'affaire-attachments' AND is_chef_or_admin());

CREATE POLICY "affaire_attachments_insert_chef_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'affaire-attachments' AND is_chef_or_admin());

CREATE POLICY "affaire_attachments_update_chef_admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'affaire-attachments' AND is_chef_or_admin())
  WITH CHECK (bucket_id = 'affaire-attachments' AND is_chef_or_admin());

CREATE POLICY "affaire_attachments_delete_chef_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'affaire-attachments' AND is_chef_or_admin());