CREATE TABLE public.ia_feedback_logistique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid REFERENCES public.emails_entrants(id) ON DELETE SET NULL,
  email_subject text,
  propose jsonb NOT NULL DEFAULT '[]'::jsonb,
  retenu jsonb NOT NULL DEFAULT '[]'::jsonb,
  commentaire text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ia_feedback_logistique TO authenticated;
GRANT ALL ON public.ia_feedback_logistique TO service_role;
ALTER TABLE public.ia_feedback_logistique ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_fb_select ON public.ia_feedback_logistique FOR SELECT TO authenticated USING (public.user_has_cap('logistique.planning.view'));
CREATE POLICY ia_fb_insert ON public.ia_feedback_logistique FOR INSERT TO authenticated WITH CHECK (public.user_has_cap('logistique.etape.edit'));
CREATE INDEX ia_fb_created_idx ON public.ia_feedback_logistique (created_at DESC);