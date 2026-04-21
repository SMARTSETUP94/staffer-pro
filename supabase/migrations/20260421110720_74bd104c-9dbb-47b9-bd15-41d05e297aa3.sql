-- 1. Enums
CREATE TYPE public.feedback_type AS ENUM ('bug', 'idee', 'amelioration', 'question');
CREATE TYPE public.feedback_priorite AS ENUM ('basse', 'moyenne', 'haute', 'critique');
CREATE TYPE public.feedback_statut AS ENUM ('nouveau', 'en_cours', 'resolu', 'ferme', 'rejete');

-- 2. Table feedbacks
CREATE TABLE public.feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.feedback_type NOT NULL DEFAULT 'bug',
  priorite public.feedback_priorite NOT NULL DEFAULT 'moyenne',
  statut public.feedback_statut NOT NULL DEFAULT 'nouveau',
  titre TEXT NOT NULL,
  description TEXT NOT NULL,
  page_url TEXT,
  user_agent TEXT,
  screenshot_path TEXT,
  notes_admin TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedbacks_author ON public.feedbacks(author_id);
CREATE INDEX idx_feedbacks_statut ON public.feedbacks(statut);
CREATE INDEX idx_feedbacks_created_at ON public.feedbacks(created_at DESC);

-- 3. RLS
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedbacks_select_own_or_admin
  ON public.feedbacks FOR SELECT
  TO authenticated
  USING (author_id = auth.uid() OR public.is_admin());

CREATE POLICY feedbacks_insert_chef_admin
  ON public.feedbacks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_chef_or_admin() AND author_id = auth.uid());

CREATE POLICY feedbacks_update_admin
  ON public.feedbacks FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY feedbacks_delete_admin
  ON public.feedbacks FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 4. Trigger updated_at
CREATE TRIGGER feedbacks_set_updated_at
  BEFORE UPDATE ON public.feedbacks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Trigger notification admins lors d'un nouveau feedback
CREATE OR REPLACE FUNCTION public.notify_feedback_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin RECORD;
  _author RECORD;
  _type_label TEXT;
BEGIN
  SELECT full_name, email INTO _author FROM public.profiles WHERE id = NEW.author_id;
  _type_label := CASE NEW.type
    WHEN 'bug' THEN 'Bug'
    WHEN 'idee' THEN 'Idée'
    WHEN 'amelioration' THEN 'Amélioration'
    ELSE 'Question'
  END;

  FOR _admin IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
  LOOP
    -- Ne pas notifier l'auteur lui-même s'il est admin
    IF _admin.user_id <> NEW.author_id THEN
      PERFORM public.create_notification(
        _admin.user_id,
        'mention'::public.notification_type,
        format('Nouveau signalement : %s', _type_label),
        format('%s — %s', COALESCE(_author.full_name, _author.email, 'Quelqu''un'), NEW.titre),
        '/admin/feedback',
        jsonb_build_object('feedback_id', NEW.id, 'type', NEW.type)
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER feedbacks_notify_admins_on_insert
  AFTER INSERT ON public.feedbacks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_feedback_created();

-- 6. Auto-fill resolved_at/by quand statut passe à resolu/ferme
CREATE OR REPLACE FUNCTION public.guard_feedback_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
    IF NEW.statut IN ('resolu', 'ferme', 'rejete') AND OLD.statut NOT IN ('resolu', 'ferme', 'rejete') THEN
      NEW.resolved_at := COALESCE(NEW.resolved_at, now());
      NEW.resolved_by := COALESCE(NEW.resolved_by, auth.uid());
    ELSIF NEW.statut IN ('nouveau', 'en_cours') THEN
      NEW.resolved_at := NULL;
      NEW.resolved_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER feedbacks_guard_resolution
  BEFORE UPDATE ON public.feedbacks
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_feedback_resolution();

-- 7. Storage bucket privé pour les captures
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-screenshots', 'feedback-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Policies storage : auteur upload + auteur/admin lecture
CREATE POLICY "feedback_screenshots_insert_chef_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'feedback-screenshots'
    AND public.is_chef_or_admin()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "feedback_screenshots_select_owner_or_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'feedback-screenshots'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "feedback_screenshots_delete_owner_or_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'feedback-screenshots'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );