-- 1. objet_heures_metier
CREATE TABLE IF NOT EXISTS public.objet_heures_metier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objet_id uuid NOT NULL REFERENCES public.fabrication_objets(id) ON DELETE CASCADE,
  metier_id integer NOT NULL REFERENCES public.metiers(id),
  heures_prevues numeric NOT NULL DEFAULT 0 CHECK (heures_prevues >= 0),
  origine text NOT NULL DEFAULT 'devis' CHECK (origine IN ('devis','ajout')),
  note text,
  sous_traitance boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (objet_id, metier_id)
);
CREATE INDEX IF NOT EXISTS idx_ohm_objet ON public.objet_heures_metier(objet_id);
CREATE INDEX IF NOT EXISTS idx_ohm_metier ON public.objet_heures_metier(metier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objet_heures_metier TO authenticated;
GRANT ALL ON public.objet_heures_metier TO service_role;
ALTER TABLE public.objet_heures_metier ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ohm_select ON public.objet_heures_metier;
CREATE POLICY ohm_select ON public.objet_heures_metier FOR SELECT TO authenticated
USING (public.is_chef_or_admin() OR public.user_has_affaire_access(public.fab_objet_affaire_id(objet_id)));

DROP POLICY IF EXISTS ohm_modify ON public.objet_heures_metier;
CREATE POLICY ohm_modify ON public.objet_heures_metier FOR ALL TO authenticated
USING (public.is_chef_or_admin())
WITH CHECK (public.is_chef_or_admin());

-- 1b. trigger miroir vers fabrication_objets
CREATE OR REPLACE FUNCTION public.sync_objet_heures_colonnes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_objet uuid;
BEGIN
  v_objet := COALESCE(NEW.objet_id, OLD.objet_id);
  UPDATE public.fabrication_objets o SET
    heures_prevues_be          = COALESCE((SELECT SUM(heures_prevues) FROM public.objet_heures_metier WHERE objet_id = v_objet AND metier_id = 8), 0),
    heures_prevues_numerique   = COALESCE((SELECT SUM(heures_prevues) FROM public.objet_heures_metier WHERE objet_id = v_objet AND metier_id = 4), 0),
    heures_prevues_bois        = COALESCE((SELECT SUM(heures_prevues) FROM public.objet_heures_metier WHERE objet_id = v_objet AND metier_id = 1), 0),
    heures_prevues_metal       = COALESCE((SELECT SUM(heures_prevues) FROM public.objet_heures_metier WHERE objet_id = v_objet AND metier_id = 2), 0),
    heures_prevues_peinture    = COALESCE((SELECT SUM(heures_prevues) FROM public.objet_heures_metier WHERE objet_id = v_objet AND metier_id = 3), 0),
    heures_prevues_tapisserie  = COALESCE((SELECT SUM(heures_prevues) FROM public.objet_heures_metier WHERE objet_id = v_objet AND metier_id = 5), 0),
    heures_prevues_manutention = COALESCE((SELECT SUM(heures_prevues) FROM public.objet_heures_metier WHERE objet_id = v_objet AND metier_id = 7), 0),
    updated_at = now()
  WHERE o.id = v_objet;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ohm_sync ON public.objet_heures_metier;
CREATE TRIGGER trg_ohm_sync
AFTER INSERT OR UPDATE OR DELETE ON public.objet_heures_metier
FOR EACH ROW EXECUTE FUNCTION public.sync_objet_heures_colonnes();

DROP TRIGGER IF EXISTS trg_ohm_updated_at ON public.objet_heures_metier;
CREATE TRIGGER trg_ohm_updated_at BEFORE UPDATE ON public.objet_heures_metier
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 1c. migration des données existantes
INSERT INTO public.objet_heures_metier (objet_id, metier_id, heures_prevues, origine)
SELECT o.id, m.metier_id, m.h, 'devis'
FROM public.fabrication_objets o
CROSS JOIN LATERAL (VALUES
  (8, o.heures_prevues_be),
  (4, o.heures_prevues_numerique),
  (1, o.heures_prevues_bois),
  (2, o.heures_prevues_metal),
  (3, o.heures_prevues_peinture),
  (5, o.heures_prevues_tapisserie),
  (7, o.heures_prevues_manutention)
) AS m(metier_id, h)
WHERE COALESCE(m.h, 0) > 0
ON CONFLICT (objet_id, metier_id) DO NOTHING;

-- 2. fabrication_lots
CREATE TABLE IF NOT EXISTS public.fabrication_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  nom text NOT NULL,
  ordre integer NOT NULL DEFAULT 0,
  couleur text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fab_lots_affaire ON public.fabrication_lots(affaire_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fabrication_lots TO authenticated;
GRANT ALL ON public.fabrication_lots TO service_role;
ALTER TABLE public.fabrication_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fab_lots_select ON public.fabrication_lots;
CREATE POLICY fab_lots_select ON public.fabrication_lots FOR SELECT TO authenticated
USING (public.is_chef_or_admin() OR public.user_has_affaire_access(affaire_id));

DROP POLICY IF EXISTS fab_lots_modify ON public.fabrication_lots;
CREATE POLICY fab_lots_modify ON public.fabrication_lots FOR ALL TO authenticated
USING (public.is_chef_or_admin()) WITH CHECK (public.is_chef_or_admin());

DROP TRIGGER IF EXISTS trg_fab_lots_updated_at ON public.fabrication_lots;
CREATE TRIGGER trg_fab_lots_updated_at BEFORE UPDATE ON public.fabrication_lots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fabrication_objets ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.fabrication_lots(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fab_objets_lot ON public.fabrication_objets(lot_id);

CREATE OR REPLACE FUNCTION public.guard_objet_lot_meme_affaire()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lot_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.fabrication_lots l WHERE l.id = NEW.lot_id AND l.affaire_id = NEW.affaire_id) THEN
      RAISE EXCEPTION 'Le lot % n''appartient pas à l''affaire de cet objet', NEW.lot_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_objet_lot_coherence ON public.fabrication_objets;
CREATE TRIGGER trg_objet_lot_coherence BEFORE INSERT OR UPDATE OF lot_id, affaire_id ON public.fabrication_objets
FOR EACH ROW EXECUTE FUNCTION public.guard_objet_lot_meme_affaire();

-- 3. atelier_planning
CREATE TABLE IF NOT EXISTS public.atelier_planning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  objet_id uuid REFERENCES public.fabrication_objets(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.fabrication_lots(id) ON DELETE CASCADE,
  metier_id integer NOT NULL REFERENCES public.metiers(id),
  date date NOT NULL,
  nb_pers smallint NOT NULL DEFAULT 1 CHECK (nb_pers > 0 AND nb_pers <= 30),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (objet_id IS NOT NULL OR lot_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_atelier_planning_affaire_date ON public.atelier_planning(affaire_id, date);
CREATE INDEX IF NOT EXISTS idx_atelier_planning_metier_date ON public.atelier_planning(metier_id, date);
CREATE INDEX IF NOT EXISTS idx_atelier_planning_objet ON public.atelier_planning(objet_id);
CREATE INDEX IF NOT EXISTS idx_atelier_planning_lot ON public.atelier_planning(lot_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atelier_planning TO authenticated;
GRANT ALL ON public.atelier_planning TO service_role;
ALTER TABLE public.atelier_planning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atelier_planning_select ON public.atelier_planning;
CREATE POLICY atelier_planning_select ON public.atelier_planning FOR SELECT TO authenticated
USING (public.is_chef_or_admin() OR public.user_has_affaire_access(affaire_id));

DROP POLICY IF EXISTS atelier_planning_modify ON public.atelier_planning;
CREATE POLICY atelier_planning_modify ON public.atelier_planning FOR ALL TO authenticated
USING (public.is_chef_or_admin() OR public.current_user_has_capability('section.planning_fab'))
WITH CHECK (public.is_chef_or_admin() OR public.current_user_has_capability('section.planning_fab'));

DROP TRIGGER IF EXISTS trg_atelier_planning_updated_at ON public.atelier_planning;
CREATE TRIGGER trg_atelier_planning_updated_at BEFORE UPDATE ON public.atelier_planning
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. lien assignations
ALTER TABLE public.assignations ADD COLUMN IF NOT EXISTS atelier_planning_id uuid REFERENCES public.atelier_planning(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assignations_atelier_planning ON public.assignations(atelier_planning_id);

-- 5. vue de consolidation
CREATE OR REPLACE VIEW public.v_atelier_charge_jour
WITH (security_invoker = true) AS
SELECT
  m.id AS metier_id,
  m.libelle AS metier_libelle,
  m.capacite_jour,
  p.date,
  SUM(p.nb_pers)::integer AS nb_pers_total,
  COUNT(DISTINCT p.affaire_id)::integer AS nb_affaires,
  COALESCE((
    SELECT COUNT(DISTINCT a.employe_id)
    FROM public.assignations a
    WHERE a.atelier_planning_id IN (SELECT p2.id FROM public.atelier_planning p2 WHERE p2.metier_id = m.id AND p2.date = p.date)
  ), 0)::integer AS nb_pers_nommees
FROM public.atelier_planning p
JOIN public.metiers m ON m.id = p.metier_id
GROUP BY m.id, m.libelle, m.capacite_jour, p.date;

GRANT SELECT ON public.v_atelier_charge_jour TO authenticated;
GRANT SELECT ON public.v_atelier_charge_jour TO service_role;