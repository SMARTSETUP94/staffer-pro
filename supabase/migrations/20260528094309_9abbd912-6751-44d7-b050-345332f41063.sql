-- Bloc 10.1 — Fondations DB Opportunités enrichies
-- Tables: opportunite_actions (timeline), opportunite_jalons (pipeline)
-- Caps: action.create/edit/delete_opportunite + opportunites.read.mine
-- RPC atomique: sign_opportunite
-- Seed: 4 jalons par défaut sur les 196 opps existantes

-- ============================================================
-- 1. opportunite_actions (timeline)
-- ============================================================
CREATE TYPE public.opp_action_type AS ENUM (
  'email_envoye',
  'email_recu',
  'rdv_planifie',
  'rdv_realise',
  'relance_tel',
  'relance_email',
  'note_interne',
  'devis_envoye',
  'echantillon_presente',
  'autre'
);

CREATE TABLE public.opportunite_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  type public.opp_action_type NOT NULL,
  date timestamptz NOT NULL DEFAULT now(),
  auteur_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  texte text NOT NULL,
  prochaine_action_due_le date,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunite_actions TO authenticated;
GRANT ALL ON public.opportunite_actions TO service_role;

CREATE INDEX idx_opportunite_actions_affaire_date
  ON public.opportunite_actions (affaire_id, date DESC);

CREATE INDEX idx_opportunite_actions_prochaine_action
  ON public.opportunite_actions (prochaine_action_due_le)
  WHERE prochaine_action_due_le IS NOT NULL;

CREATE TRIGGER trg_opportunite_actions_updated_at
  BEFORE UPDATE ON public.opportunite_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.opportunite_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY opportunite_actions_select ON public.opportunite_actions
  FOR SELECT TO authenticated
  USING (
    public.user_has_cap('opportunites.read.all')
    OR (
      public.user_has_cap('opportunites.read.mine')
      AND EXISTS (
        SELECT 1 FROM public.affaires a
        WHERE a.id = opportunite_actions.affaire_id
          AND a.charge_affaires_id = auth.uid()
      )
    )
  );

CREATE POLICY opportunite_actions_insert ON public.opportunite_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_cap('action.edit_opportunite')
    AND EXISTS (
      SELECT 1 FROM public.affaires a
      WHERE a.id = opportunite_actions.affaire_id
        AND a.phase = 'opportunite'
        AND (
          public.user_has_cap('opportunites.read.all')
          OR a.charge_affaires_id = auth.uid()
        )
    )
  );

CREATE POLICY opportunite_actions_update ON public.opportunite_actions
  FOR UPDATE TO authenticated
  USING (
    public.user_has_cap('action.edit_opportunite')
    AND EXISTS (
      SELECT 1 FROM public.affaires a
      WHERE a.id = opportunite_actions.affaire_id
        AND (
          public.user_has_cap('opportunites.read.all')
          OR a.charge_affaires_id = auth.uid()
        )
    )
  );

CREATE POLICY opportunite_actions_delete ON public.opportunite_actions
  FOR DELETE TO authenticated
  USING (public.user_has_cap('action.delete_opportunite'));

COMMENT ON TABLE public.opportunite_actions IS
  'Bloc 10.1 — Timeline actions commerciales sur opportunité.';

-- ============================================================
-- 2. opportunite_jalons (pipeline)
-- ============================================================
CREATE TYPE public.opp_jalon_etape AS ENUM (
  'qualification',
  'devis_envoye',
  'negociation',
  'signature'
);

CREATE TABLE public.opportunite_jalons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  etape public.opp_jalon_etape NOT NULL,
  date_prevue date,
  date_atteinte date,
  ordre integer NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opportunite_jalons_unique UNIQUE (affaire_id, etape)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunite_jalons TO authenticated;
GRANT ALL ON public.opportunite_jalons TO service_role;

CREATE INDEX idx_opportunite_jalons_affaire
  ON public.opportunite_jalons (affaire_id, ordre);

CREATE TRIGGER trg_opportunite_jalons_updated_at
  BEFORE UPDATE ON public.opportunite_jalons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.opportunite_jalons ENABLE ROW LEVEL SECURITY;

CREATE POLICY opportunite_jalons_select ON public.opportunite_jalons
  FOR SELECT TO authenticated
  USING (
    public.user_has_cap('opportunites.read.all')
    OR (
      public.user_has_cap('opportunites.read.mine')
      AND EXISTS (
        SELECT 1 FROM public.affaires a
        WHERE a.id = opportunite_jalons.affaire_id
          AND a.charge_affaires_id = auth.uid()
      )
    )
  );

CREATE POLICY opportunite_jalons_modify ON public.opportunite_jalons
  FOR ALL TO authenticated
  USING (
    public.user_has_cap('action.edit_opportunite')
    AND EXISTS (
      SELECT 1 FROM public.affaires a
      WHERE a.id = opportunite_jalons.affaire_id
        AND (
          public.user_has_cap('opportunites.read.all')
          OR a.charge_affaires_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    public.user_has_cap('action.edit_opportunite')
    AND EXISTS (
      SELECT 1 FROM public.affaires a
      WHERE a.id = opportunite_jalons.affaire_id
        AND (
          public.user_has_cap('opportunites.read.all')
          OR a.charge_affaires_id = auth.uid()
        )
    )
  );

COMMENT ON TABLE public.opportunite_jalons IS
  'Bloc 10.1 — Étapes pipeline commercial (qualif → devis → négo → signature).';

-- ============================================================
-- 3. Caps + matrice
-- ============================================================
INSERT INTO public.capabilities (key, label, description, category, sort_order) VALUES
  ('action.create_opportunite',  'Créer une opportunité',     '9XXX — ouverture lead', 'actions', 16),
  ('action.edit_opportunite',    'Éditer une opportunité',    'Notes, jalons, actions', 'actions', 17),
  ('action.delete_opportunite',  'Supprimer une opportunité', 'Admin only',             'actions', 18),
  ('opportunites.read.mine',     'Voir mes opportunités',     'Scope own pour CA',      'data',    7)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_capabilities (role, capability, granted, scope) VALUES
  ('admin',         'action.create_opportunite', true, 'all'),
  ('admin',         'action.edit_opportunite',   true, 'all'),
  ('admin',         'action.delete_opportunite', true, 'all'),
  ('admin',         'opportunites.read.mine',    true, 'all'),
  ('commercial',    'action.create_opportunite', true, 'own'),
  ('commercial',    'action.edit_opportunite',   true, 'own'),
  ('commercial',    'opportunites.read.mine',    true, 'own'),
  ('chef_chantier', 'action.create_opportunite', true, 'all'),
  ('chef_chantier', 'action.edit_opportunite',   true, 'all'),
  ('chef_chantier', 'opportunites.read.mine',    true, 'all')
ON CONFLICT (role, capability) DO UPDATE
  SET granted = EXCLUDED.granted, scope = EXCLUDED.scope;

-- ============================================================
-- 4. RPC sign_opportunite (atomique)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sign_opportunite(_affaire_id uuid)
RETURNS TABLE (
  affaire_id uuid,
  ancien_numero text,
  nouveau_numero text,
  signed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_numero text;
  v_new_numero_int integer;
  v_new_numero text;
  v_signed_at timestamptz := now();
BEGIN
  IF NOT public.user_has_cap('action.sign_opportunite') THEN
    RAISE EXCEPTION 'forbidden: action.sign_opportunite required';
  END IF;

  PERFORM 1 FROM public.affaires
  WHERE id = _affaire_id AND phase = 'opportunite'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunite not found or already signed: %', _affaire_id;
  END IF;

  SELECT numero INTO v_current_numero
  FROM public.affaires WHERE id = _affaire_id;

  PERFORM pg_advisory_xact_lock(hashtext('sign_opportunite_5xxx'));

  SELECT COALESCE(MAX(CAST(SUBSTRING(numero FROM 2) AS integer)), 4999) + 1
    INTO v_new_numero_int
  FROM public.affaires
  WHERE numero ~ '^5[0-9]{3}$';

  IF v_new_numero_int > 5999 THEN
    RAISE EXCEPTION 'numero 5XXX overflow — max 5999 atteint';
  END IF;

  v_new_numero := '5' || LPAD(v_new_numero_int::text, 3, '0');

  UPDATE public.affaires
  SET phase = 'signe',
      numero = v_new_numero,
      signed_at = v_signed_at,
      statut_opportunite = NULL
  WHERE id = _affaire_id;

  UPDATE public.opportunite_jalons
  SET date_atteinte = v_signed_at::date
  WHERE opportunite_jalons.affaire_id = _affaire_id AND etape = 'signature';

  INSERT INTO public.opportunite_actions (affaire_id, type, date, auteur_id, texte)
  VALUES (
    _affaire_id, 'autre', v_signed_at, auth.uid(),
    'Opportunité signée — code ' || v_current_numero || ' → ' || v_new_numero
  );

  RETURN QUERY SELECT _affaire_id, v_current_numero, v_new_numero, v_signed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sign_opportunite(uuid) TO authenticated;

COMMENT ON FUNCTION public.sign_opportunite(uuid) IS
  'Bloc 10.1 — Signe atomiquement une opp (9XXX→5XXX, jalon, log timeline). Advisory lock pour sérialiser.';

-- ============================================================
-- 5. Seed 4 jalons par défaut sur les 196 opps existantes
-- ============================================================
INSERT INTO public.opportunite_jalons (affaire_id, etape, ordre)
SELECT a.id, j.etape, j.ordre
FROM public.affaires a
CROSS JOIN (VALUES
  ('qualification'::opp_jalon_etape, 1),
  ('devis_envoye'::opp_jalon_etape,  2),
  ('negociation'::opp_jalon_etape,   3),
  ('signature'::opp_jalon_etape,     4)
) AS j(etape, ordre)
WHERE a.phase = 'opportunite'
ON CONFLICT (affaire_id, etape) DO NOTHING;
