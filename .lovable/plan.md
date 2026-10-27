# Lot 1 — Équipe projet, « Presque gagné », planning de pilotage

Principe : rien de bloquant, aucune suppression physique, migrations explicites et idempotentes. Rien n'est appliqué ni codé avant validation du SQL ci-dessous. Aucune publication sans accord.

## État vérifié
- Affaires : 88 avec chargé d'affaires, 16 avec chef de projet, 1 avec dessinateur ; 0 chargé d'affaires sans fiche employé.
- Colonnes historiques `charge_affaires_id`, `chef_projet_id`, `dessinateur_id` → `profiles`.
- `app_modifier_affaire` contient la restriction « Dessinateur réservé aux 6XXX » ; `sign_opportunite(uuid,text,uuid,uuid)` aussi, et écrase chef de projet / dessinateur même quand ils sont vides.
- Kevin Lebon : 68f44ab5 (compte 26d1c2ac) et d65ba705 (sans compte), tous deux actifs.
- Archivage des affaires : colonne `archived_at`.
- Compte smart@setup.paris (53 affaires en chargé d'affaires, connecté aujourd'hui) relié à la fiche « SMART RESTR » (87f35983). La fiche Gabin C (7b9de5c4) est reliée au compte gabinchaussegros@gmail.com (0 affaire, dernière connexion le 3 août). Aucun compte n'est relié à plusieurs fiches.
- `sign_opportunite(uuid,text)` renvoie le même identifiant d'affaire.

**Point d'attention** : une fiche employé ne porte qu'un seul compte. Relier smart@setup.paris à Gabin C détache le compte gmail, qui garde son accès et son rôle mais n'a plus de fiche employé. À signaler avant application si ce compte doit rester relié.

## Comptage fusion Kevin (avant application)
17 clés étrangères réelles vers `employes` recensées (pg_constraint) + scan de toutes les colonnes uuid des tables publiques :

| Table.colonne | d65ba705 (à fusionner) | 68f44ab5 (cible) |
|---|---|---|
| employe_metiers.employe_id | 1 | 0 |
| absences, affaire_equipe, assignations, heures_saisies, mission_events, staffing_plan_assignment, fabrication_objet_equipe, employes_autorisations_vehicules, vehicule_chauffeurs_autorises, swap_requests (from/to), trajets.chauffeur_id, affaires.chef_chantier_id, contrats_intermittents.employee_id, heures_validations.valide_par_chef_id, heures_saisies_historique.pour_compte_de | 0 | 0 |
| toutes autres colonnes uuid (sans FK) | 0 | 0 |

Toutes les requêtes du lot filtrent l'archivage par `archived_at IS NULL`.

Après : 0 référence vers d65ba705, fiche désactivée. La migration recompte et s'arrête si le résultat diffère.

## Corrections intégrées
1. **Charge** : `nb_en_cours` = presque gagné + gagné + affaires signées en cours (hors terminé/annulé/perdu) ; `nb_potentielles` = à faire + envoyé, colonne séparée, jamais additionnée. Sélecteur : « Nadège – 4 en cours (+3 potentielles) ».
2. **Fusion Kevin** : toutes les FK réelles + scan uuid (tableau ci-dessus).
3. **Dates par défaut** : responsable projet sans dates → pré-rempli à la création (début = début de production, sinon début ; fin = démontage, sinon fin prévue), modifiable ensuite. Concepteur : aucune date par défaut ; le bouton « Planifier » propose une période (côté écran, calculée par un helper testé, enregistrée seulement après validation).

## SQL — 0036_enum_presque_gagne
Seule dans sa migration (une nouvelle valeur d'enum ne peut pas servir dans la même transaction).
```sql
ALTER TYPE public.opportunite_statut ADD VALUE IF NOT EXISTS 'presque_gagne' BEFORE 'gagne';
```

## SQL — 0037_roles_projet
```sql
DO $$ BEGIN
  CREATE TYPE public.projet_role AS ENUM ('charge_affaires','concepteur','responsable_projet',
    'chef_constructeur','chef_finition','chef_montage','chef_demontage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.referent_niveau AS ENUM ('principal','secondaire');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Référents par rôle
CREATE TABLE IF NOT EXISTS public.role_referents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id uuid NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  role public.projet_role NOT NULL,
  niveau public.referent_niveau NOT NULL DEFAULT 'principal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  CONSTRAINT role_referents_employe_role_key UNIQUE (employe_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_referents TO authenticated;
GRANT ALL ON public.role_referents TO service_role;
ALTER TABLE public.role_referents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_referents_select ON public.role_referents;
CREATE POLICY role_referents_select ON public.role_referents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS role_referents_admin_write ON public.role_referents;
CREATE POLICY role_referents_admin_write ON public.role_referents FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Équipe projet par affaire
CREATE TABLE IF NOT EXISTS public.affaire_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affaire_id uuid NOT NULL REFERENCES public.affaires(id) ON DELETE CASCADE,
  role public.projet_role NOT NULL,
  employe_id uuid NOT NULL REFERENCES public.employes(id) ON DELETE RESTRICT,
  date_debut date,
  date_fin date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  CONSTRAINT affaire_roles_affaire_role_key UNIQUE (affaire_id, role)
);
CREATE INDEX IF NOT EXISTS affaire_roles_employe_idx ON public.affaire_roles(employe_id, role);
CREATE INDEX IF NOT EXISTS affaire_roles_periode_idx ON public.affaire_roles(date_debut, date_fin);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affaire_roles TO authenticated;
GRANT ALL ON public.affaire_roles TO service_role;
ALTER TABLE public.affaire_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affaire_roles_select ON public.affaire_roles;
CREATE POLICY affaire_roles_select ON public.affaire_roles FOR SELECT TO authenticated
  USING (public.is_chef_or_admin() OR public.user_has_affaire_access(affaire_id));
DROP POLICY IF EXISTS affaire_roles_write ON public.affaire_roles;
CREATE POLICY affaire_roles_write ON public.affaire_roles FOR ALL TO authenticated
  USING (public.user_has_cap('affaires.edit') AND public.user_has_affaire_access(affaire_id))
  WITH CHECK (public.user_has_cap('affaires.edit') AND public.user_has_affaire_access(affaire_id));
-- Même blocage OAuth que les 7 tables MCP existantes
DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.affaire_roles;
CREATE POLICY mcp_oauth_block_insert ON public.affaire_roles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL OR CURRENT_USER = 'mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.affaire_roles;
CREATE POLICY mcp_oauth_block_update ON public.affaire_roles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL OR CURRENT_USER = 'mcp_business_rls')
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL OR CURRENT_USER = 'mcp_business_rls');
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.affaire_roles;
CREATE POLICY mcp_oauth_block_delete ON public.affaire_roles AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL OR CURRENT_USER = 'mcp_business_rls');
-- (mêmes 3 policies restrictives sur role_referents)
DROP POLICY IF EXISTS mcp_oauth_block_insert ON public.role_referents;
CREATE POLICY mcp_oauth_block_insert ON public.role_referents AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL);
DROP POLICY IF EXISTS mcp_oauth_block_update ON public.role_referents;
CREATE POLICY mcp_oauth_block_update ON public.role_referents AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL) WITH CHECK ((auth.jwt()->>'client_id') IS NULL);
DROP POLICY IF EXISTS mcp_oauth_block_delete ON public.role_referents;
CREATE POLICY mcp_oauth_block_delete ON public.role_referents AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL);

-- Normalisation + dates par défaut du responsable projet (non bloquant : fin < début → fin ramenée à début)
CREATE OR REPLACE FUNCTION public.affaire_roles_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE a record;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role = 'responsable_projet'
     AND NEW.date_debut IS NULL AND NEW.date_fin IS NULL THEN
    SELECT date_debut_production, date_debut, date_demontage, date_fin_prevue
      INTO a FROM public.affaires WHERE id = NEW.affaire_id;
    NEW.date_debut := COALESCE(a.date_debut_production, a.date_debut);
    NEW.date_fin   := COALESCE(a.date_demontage, a.date_fin_prevue);
  END IF;
  IF NEW.date_debut IS NOT NULL AND NEW.date_fin IS NOT NULL AND NEW.date_fin < NEW.date_debut THEN
    NEW.date_fin := NEW.date_debut;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_affaire_roles_before_write ON public.affaire_roles;
CREATE TRIGGER trg_affaire_roles_before_write BEFORE INSERT OR UPDATE ON public.affaire_roles
  FOR EACH ROW EXECUTE FUNCTION public.affaire_roles_before_write();

-- Date d'entrée dans le statut d'opportunité
ALTER TABLE public.affaires ADD COLUMN IF NOT EXISTS statut_opportunite_depuis timestamptz;
UPDATE public.affaires SET statut_opportunite_depuis = COALESCE(updated_at, created_at)
  WHERE statut_opportunite IS NOT NULL AND statut_opportunite_depuis IS NULL;
CREATE OR REPLACE FUNCTION public.affaires_stamp_statut_opportunite()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.statut_opportunite IS DISTINCT FROM OLD.statut_opportunite THEN
    NEW.statut_opportunite_depuis := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_affaires_stamp_statut_opp ON public.affaires;
CREATE TRIGGER trg_affaires_stamp_statut_opp BEFORE INSERT OR UPDATE OF statut_opportunite ON public.affaires
  FOR EACH ROW EXECUTE FUNCTION public.affaires_stamp_statut_opportunite();
```

## SQL — 0038_affaire_roles_sync
Commence par corriger la liaison smart@setup.paris et par un contrôle bloquant, AVANT les triggers et la reprise.
```sql
-- 0) Liaison du compte smart@setup.paris : Gabin C au lieu de SMART RESTR
DO $$
DECLARE v_smart uuid;
BEGIN
  SELECT id INTO v_smart FROM public.profiles WHERE lower(email) = 'smart@setup.paris';
  IF v_smart IS NULL THEN RAISE EXCEPTION 'Compte smart@setup.paris introuvable'; END IF;
  UPDATE public.employes SET profile_id = NULL
   WHERE id = '87f35983-c9e2-45eb-aa5a-678aed9e59f6' AND profile_id = v_smart;   -- SMART RESTR
  UPDATE public.employes SET profile_id = v_smart
   WHERE id = '7b9de5c4-3f3d-4f3d-8608-a533dd0c543d';                            -- Gabin C
END $$;

-- 0bis) Contrôle : aucun compte relié à plusieurs fiches, aucun compte relié à une fiche non nominative
DO $$
DECLARE v_multi text; v_nonnom text;
BEGIN
  SELECT string_agg(profile_id::text || ' (' || n || ' fiches)', ', ') INTO v_multi
    FROM (SELECT profile_id, count(*) n FROM public.employes
          WHERE profile_id IS NOT NULL GROUP BY profile_id HAVING count(*) > 1) s;
  SELECT string_agg(e.id::text || ' ' || coalesce(e.prenom,'') || ' ' || e.nom, ', ') INTO v_nonnom
    FROM public.employes e
   WHERE e.profile_id IS NOT NULL
     AND (coalesce(trim(e.prenom),'') = ''
          OR e.nom ~* '(smart|restr|setup|log@|devis@|admin|test)');
  IF v_multi IS NOT NULL OR v_nonnom IS NOT NULL THEN
    RAISE EXCEPTION 'Liaison compte/fiche ambiguë. Multiples : % ; non nominatives : %',
      coalesce(v_multi,'aucune'), coalesce(v_nonnom,'aucune');
  END IF;
END $$;
```
Correspondance : chargé d'affaires ↔ `charge_affaires_id`, responsable projet ↔ `chef_projet_id`, concepteur ↔ `dessinateur_id`. Anti-boucle par `pg_trigger_depth()`.
```sql
-- affaire_roles → colonnes historiques (NULL si l'employé n'a pas de compte ou si le rôle est retiré)
CREATE OR REPLACE FUNCTION public.affaire_roles_sync_to_affaires()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_profile uuid; v_col text;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  v_col := CASE r.role WHEN 'charge_affaires' THEN 'charge_affaires_id'
                       WHEN 'responsable_projet' THEN 'chef_projet_id'
                       WHEN 'concepteur' THEN 'dessinateur_id' END;
  IF v_col IS NULL THEN RETURN NULL; END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT profile_id INTO v_profile FROM public.employes WHERE id = NEW.employe_id;
  END IF;
  EXECUTE format('UPDATE public.affaires SET %I = $1 WHERE id = $2 AND %I IS DISTINCT FROM $1', v_col, v_col)
    USING v_profile, r.affaire_id;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.affaire_roles_sync_to_affaires() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_affaire_roles_sync ON public.affaire_roles;
CREATE TRIGGER trg_affaire_roles_sync AFTER INSERT OR UPDATE OR DELETE ON public.affaire_roles
  FOR EACH ROW EXECUTE FUNCTION public.affaire_roles_sync_to_affaires();

-- colonnes historiques (ancien code, pipeline, Claude v1/v2) → affaire_roles
CREATE OR REPLACE FUNCTION public.affaires_sync_to_affaire_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pair record; v_emp uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  FOR pair IN SELECT * FROM (VALUES
      ('charge_affaires'::public.projet_role, NEW.charge_affaires_id,
        CASE WHEN TG_OP='UPDATE' THEN OLD.charge_affaires_id END),
      ('responsable_projet'::public.projet_role, NEW.chef_projet_id,
        CASE WHEN TG_OP='UPDATE' THEN OLD.chef_projet_id END),
      ('concepteur'::public.projet_role, NEW.dessinateur_id,
        CASE WHEN TG_OP='UPDATE' THEN OLD.dessinateur_id END)
    ) AS t(role, new_p, old_p)
  LOOP
    CONTINUE WHEN TG_OP = 'UPDATE' AND pair.new_p IS NOT DISTINCT FROM pair.old_p;
    IF pair.new_p IS NULL THEN
      -- Choix validé : vider une colonne historique retire le rôle correspondant de l'équipe projet.
      DELETE FROM public.affaire_roles WHERE affaire_id = NEW.id AND role = pair.role;
    ELSE
      SELECT id INTO v_emp FROM public.employes WHERE profile_id = pair.new_p
        ORDER BY actif DESC, created_at LIMIT 1;
      IF v_emp IS NOT NULL THEN
        INSERT INTO public.affaire_roles(affaire_id, role, employe_id)
          VALUES (NEW.id, pair.role, v_emp)
        ON CONFLICT (affaire_id, role) DO UPDATE SET employe_id = EXCLUDED.employe_id;
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.affaires_sync_to_affaire_roles() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_affaires_sync_roles ON public.affaires;
CREATE TRIGGER trg_affaires_sync_roles
  AFTER INSERT OR UPDATE OF charge_affaires_id, chef_projet_id, dessinateur_id ON public.affaires
  FOR EACH ROW EXECUTE FUNCTION public.affaires_sync_to_affaire_roles();

-- Reprise de l'existant (88 / 16 / 1 attendus)
INSERT INTO public.affaire_roles(affaire_id, role, employe_id)
SELECT a.id, v.role, e.id
FROM public.affaires a
CROSS JOIN LATERAL (VALUES
  ('charge_affaires'::public.projet_role, a.charge_affaires_id),
  ('responsable_projet'::public.projet_role, a.chef_projet_id),
  ('concepteur'::public.projet_role, a.dessinateur_id)) v(role, profile_id)
JOIN LATERAL (SELECT id FROM public.employes WHERE profile_id = v.profile_id
              ORDER BY actif DESC, created_at LIMIT 1) e ON true
WHERE v.profile_id IS NOT NULL
ON CONFLICT (affaire_id, role) DO NOTHING;
```
Note : la reprise passe par le trigger de dates ; les 16 responsables projet repris reçoivent donc les dates de leur affaire quand elles existent.

## SQL — 0039_referents_seed_et_fusion_kevin
```sql
-- 1) Fusion Kevin Lebon d65ba705 → 68f44ab5 (aucune suppression)
DO $$
DECLARE v_old uuid := 'd65ba705-bdd3-4aa3-94bf-9be9d86c3e0d';
        v_new uuid := '68f44ab5-c3a0-4514-9c7b-5ae0fd54290f';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE id = v_old) THEN RETURN; END IF;
  IF (SELECT profile_id FROM public.employes WHERE id = v_old) IS NOT NULL THEN
    RAISE EXCEPTION 'Fusion annulée : la fiche à fusionner a un compte';
  END IF;
  -- employe_metiers : on évite les doublons (la ligne déjà présente côté cible est conservée)
  UPDATE public.employe_metiers m SET employe_id = v_new
   WHERE m.employe_id = v_old
     AND NOT EXISTS (SELECT 1 FROM public.employe_metiers x
                     WHERE x.employe_id = v_new AND x.metier_id = m.metier_id);
  UPDATE public.absences                       SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.affaire_equipe                 SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.affaires                       SET chef_chantier_id = v_new WHERE chef_chantier_id = v_old;
  UPDATE public.assignations                   SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.contrats_intermittents         SET employee_id = v_new WHERE employee_id = v_old;
  UPDATE public.employes_autorisations_vehicules SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.fabrication_objet_equipe       SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.heures_saisies                 SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.heures_saisies_historique      SET pour_compte_de = v_new WHERE pour_compte_de = v_old;
  UPDATE public.heures_validations             SET valide_par_chef_id = v_new WHERE valide_par_chef_id = v_old;
  UPDATE public.mission_events                 SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.staffing_plan_assignment       SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.swap_requests                  SET from_employe_id = v_new WHERE from_employe_id = v_old;
  UPDATE public.swap_requests                  SET to_employe_id = v_new WHERE to_employe_id = v_old;
  UPDATE public.trajets                        SET chauffeur_id = v_new WHERE chauffeur_id = v_old;
  UPDATE public.vehicule_chauffeurs_autorises  SET employe_id = v_new WHERE employe_id = v_old
   AND NOT EXISTS (SELECT 1 FROM public.vehicule_chauffeurs_autorises x
                   WHERE x.employe_id = v_new AND x.vehicule_id = vehicule_chauffeurs_autorises.vehicule_id);
  UPDATE public.affaire_equipe_historique      SET employe_id = v_new WHERE employe_id = v_old;
  UPDATE public.employes SET actif = false,
         notes = concat_ws(E'\n', notes, 'Fiche fusionnée dans 68f44ab5 (Kevin Lebon) le ' || now()::date)
   WHERE id = v_old;
END $$;

-- Contrôle final : aucune clé étrangère vers employes(id) ne doit encore pointer vers d65ba705.
-- Liste dérivée de pg_constraint (lecture seule) ; échoue si une référence subsiste, doublon compris.
DO $$
DECLARE fk record; v_n bigint; v_reste text := '';
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f' AND c.confrelid = 'public.employes'::regclass
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', fk.tbl, fk.col)
      INTO v_n USING 'd65ba705-bdd3-4aa3-94bf-9be9d86c3e0d'::uuid;
    IF v_n > 0 THEN v_reste := v_reste || format('%s.%s=%s ', fk.tbl, fk.col, v_n); END IF;
  END LOOP;
  IF v_reste <> '' THEN RAISE EXCEPTION 'Fusion Kevin incomplète : %', v_reste; END IF;
END $$;

-- 2) Seed des référents (ids fournis ; échoue si un id n'existe pas, grâce à la FK)
INSERT INTO public.role_referents(employe_id, role, niveau)
SELECT v.e::uuid, v.r::public.projet_role, v.n::public.referent_niveau FROM (VALUES
 -- charge_affaires
 ('7b9de5c4-3f3d-4f3d-8608-a533dd0c543d','charge_affaires','principal'),
 ('09758232-d71f-461b-bc3e-d3afdba3a6b0','charge_affaires','principal'),
 ('1dec2ead-feaa-40f6-a7ee-c9be3417e01d','charge_affaires','principal'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','charge_affaires','secondaire'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','charge_affaires','secondaire'),
 -- concepteur
 ('c77dfa4d-53df-4f9a-beee-5c0d61d18e58','concepteur','principal'),
 ('d84b7bdf-9260-4022-bb45-ba1a8d2c57c2','concepteur','principal'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','concepteur','principal'),
 ('1dec2ead-feaa-40f6-a7ee-c9be3417e01d','concepteur','secondaire'),
 ('2350b9ed-aba2-4de0-a989-2dfb8a16fd17','concepteur','secondaire'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','concepteur','secondaire'),
 ('fa27a6d3-0639-4bb6-a913-f2d37016b659','concepteur','secondaire'),
 -- responsable_projet
 ('7b9de5c4-3f3d-4f3d-8608-a533dd0c543d','responsable_projet','principal'),
 ('09758232-d71f-461b-bc3e-d3afdba3a6b0','responsable_projet','principal'),
 ('1dec2ead-feaa-40f6-a7ee-c9be3417e01d','responsable_projet','principal'),
 ('d84b7bdf-9260-4022-bb45-ba1a8d2c57c2','responsable_projet','principal'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','responsable_projet','secondaire'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','responsable_projet','secondaire'),
 ('c77dfa4d-53df-4f9a-beee-5c0d61d18e58','responsable_projet','secondaire'),
 ('fa27a6d3-0639-4bb6-a913-f2d37016b659','responsable_projet','secondaire'),
 -- chef_constructeur
 ('2350b9ed-aba2-4de0-a989-2dfb8a16fd17','chef_constructeur','principal'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','chef_constructeur','principal'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','chef_constructeur','principal'),
 ('fa27a6d3-0639-4bb6-a913-f2d37016b659','chef_constructeur','secondaire'),
 ('1dd42406-8439-44af-82ef-8ec66c9bcbda','chef_constructeur','secondaire'),
 ('1dec2ead-feaa-40f6-a7ee-c9be3417e01d','chef_constructeur','secondaire'),
 ('bdfcae4c-7a08-45f0-a28d-102177688d78','chef_constructeur','secondaire'),
 ('8fa27b2b-1106-4cb4-ab95-5236a9425524','chef_constructeur','secondaire'),
 -- chef_finition
 ('2e535766-65c9-4660-afc4-9829ef63167b','chef_finition','principal'),
 ('7c9ca23e-7e3a-4d86-891d-b0eb227bf268','chef_finition','secondaire'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','chef_finition','secondaire'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','chef_finition','secondaire'),
 ('2298ac23-56ed-4362-ac63-c92787017fd1','chef_finition','secondaire')
) v(e, r, n)
ON CONFLICT (employe_id, role) DO NOTHING;

-- chef_montage et chef_demontage : même liste
INSERT INTO public.role_referents(employe_id, role, niveau)
SELECT v.e::uuid, r.role, v.n::public.referent_niveau
FROM (VALUES
 ('821ec0a3-74f3-4936-a97d-49564e55d9dd','principal'),
 ('186ff868-8158-4620-81dd-45a7fb84935b','principal'),
 ('ddc4c734-4f05-434e-8fcf-4b63890e1129','principal'),
 ('1dec2ead-feaa-40f6-a7ee-c9be3417e01d','principal'),
 ('7b9de5c4-3f3d-4f3d-8608-a533dd0c543d','principal'),
 ('09758232-d71f-461b-bc3e-d3afdba3a6b0','secondaire'),
 ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f','secondaire'),
 ('23844cc6-b506-4ce0-8872-072230aaa913','secondaire'),
 ('2350b9ed-aba2-4de0-a989-2dfb8a16fd17','secondaire'),
 ('25ddd4ae-2248-4a17-bae3-37ed4ed4cde9','secondaire'),
 ('c77dfa4d-53df-4f9a-beee-5c0d61d18e58','secondaire'),
 ('d84b7bdf-9260-4022-bb45-ba1a8d2c57c2','secondaire'),
 ('313b328b-919b-4453-8eb3-74c720bda8d0','secondaire')
) v(e, n)
CROSS JOIN (VALUES ('chef_montage'::public.projet_role), ('chef_demontage'::public.projet_role)) r(role)
ON CONFLICT (employe_id, role) DO NOTHING;
```
Note : le seed est une donnée initiale exigée par le lot ; il est placé dans la migration pour être rejouable à l'identique (ON CONFLICT DO NOTHING).

## SQL — 0040_pilotage
```sql
-- Charge par personne et par rôle, calculée sur TOUTES les affaires (indépendante de la portée RLS
-- de l'appelant), sans exposer les affaires : uniquement employe_id, role et deux compteurs.
CREATE OR REPLACE FUNCTION public.charge_roles_projet()
RETURNS TABLE(employe_id uuid, role public.projet_role, nb_en_cours int, nb_potentielles int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.user_has_cap('planning.pilotage') OR public.user_has_cap('affaires.edit')) THEN
    RAISE EXCEPTION 'Accès réservé au planning de pilotage' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT ar.employe_id, ar.role,
    (count(*) FILTER (WHERE
         (a.phase = 'signe' AND a.statut NOT IN ('termine','annule'))
      OR (a.phase = 'opportunite' AND a.statut_opportunite IN ('presque_gagne','gagne'))))::int,
    (count(*) FILTER (WHERE
         a.phase = 'opportunite' AND a.statut_opportunite IN ('a_faire','envoye')))::int
  FROM public.affaire_roles ar
  JOIN public.affaires a ON a.id = ar.affaire_id
  WHERE a.archived_at IS NULL
  GROUP BY ar.employe_id, ar.role;
END $$;
REVOKE EXECUTE ON FUNCTION public.charge_roles_projet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.charge_roles_projet() TO authenticated;

-- Écriture partagée UI + Claude (droits de l'appelant, RLS appliquée)
CREATE OR REPLACE FUNCTION public.app_affecter_role_projet(
  _affaire_id uuid, _role public.projet_role, _employe_id uuid,
  _date_debut date DEFAULT NULL, _date_fin date DEFAULT NULL, _note text DEFAULT NULL,
  _remplacer_dates boolean DEFAULT false)  -- true : les dates fournies remplacent, NULL compris (effacement)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('app_affecter_role_projet');
  PERFORM public.app_assert_affaire_write(_affaire_id, 'affaires.edit');
  IF _employe_id IS NULL THEN
    DELETE FROM public.affaire_roles WHERE affaire_id = _affaire_id AND role = _role;
    RETURN jsonb_build_object('affaire_id', _affaire_id, 'role', _role, 'retire', true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE id = _employe_id AND actif) THEN
    RAISE EXCEPTION 'Employé inconnu ou inactif';
  END IF;
  INSERT INTO public.affaire_roles(affaire_id, role, employe_id, date_debut, date_fin, note)
  VALUES (_affaire_id, _role, _employe_id, _date_debut, _date_fin, _note)
  ON CONFLICT (affaire_id, role) DO UPDATE SET
    employe_id = EXCLUDED.employe_id,
    date_debut = CASE WHEN _remplacer_dates THEN EXCLUDED.date_debut
                      ELSE COALESCE(EXCLUDED.date_debut, affaire_roles.date_debut) END,
    date_fin   = CASE WHEN _remplacer_dates THEN EXCLUDED.date_fin
                      ELSE COALESCE(EXCLUDED.date_fin, affaire_roles.date_fin) END,
    note       = COALESCE(EXCLUDED.note, affaire_roles.note)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'affaire_id', _affaire_id, 'role', _role, 'employe_id', _employe_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.app_affecter_role_projet(uuid, public.projet_role, uuid, date, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_affecter_role_projet(uuid, public.projet_role, uuid, date, date, text, boolean) TO authenticated, mcp_business_rls;

-- app_modifier_affaire : définition actuelle relue ; seuls changements = suppression de la
-- restriction 6XXX et ajout de 'presque_gagne' et 'gagne' aux statuts autorisés
CREATE OR REPLACE FUNCTION public.app_modifier_affaire(_id uuid, _patch jsonb)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ DECLARE k text; sets text:=''; result jsonb; BEGIN
  IF _patch ? 'statut_opportunite' AND NOT EXISTS(SELECT 1 FROM affaires WHERE id=_id AND phase='opportunite') THEN RAISE EXCEPTION 'Opportunité déjà signée'; END IF;
  PERFORM public.app_assert_affaire_write(_id,'section.affaires');
  IF _patch ? 'statut_opportunite' THEN
    PERFORM public.app_assert_affaire_write(_id,'action.edit_opportunite');
    IF _patch->>'statut_opportunite' NOT IN ('a_faire','envoye','presque_gagne','gagne','perdu') THEN RAISE EXCEPTION 'Signature interdite'; END IF;
  END IF;
  IF _patch ? 'ca_estime_ht' AND (_patch->>'ca_estime_ht')::numeric<0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF jsonb_typeof(_patch)<>'object' OR _patch='{}'::jsonb THEN RAISE EXCEPTION 'Modification vide'; END IF;
  FOR k IN SELECT jsonb_object_keys(_patch) LOOP
    IF k NOT IN ('nom','notes','lieu','date_montage','date_demontage','date_evenement_debut','date_evenement_fin','date_pat','typologie_future','ca_estime_ht','charge_affaires_id','chef_projet_id','dessinateur_id','statut','statut_opportunite','contact_site_nom','contact_site_tel','montage_nb_techniciens','montage_travail_nuit','montage_nb_semi','montage_nb_20m3','montage_nature_prestation','montage_notes','client_id','opportunite_source','client_contact_id','client','taille') THEN RAISE EXCEPTION 'Champ interdit: %',k; END IF;
    sets:=sets || CASE WHEN sets='' THEN '' ELSE ',' END || format('%I=p.%I',k,k);
  END LOOP;
  EXECUTE format('UPDATE public.affaires t SET %s FROM jsonb_populate_record(NULL::public.affaires,$1) p WHERE t.id=$2 RETURNING jsonb_build_object(''id'',t.id)',sets) INTO result USING _patch,_id;
  IF result IS NULL THEN RAISE EXCEPTION 'Modification refusée par les droits'; END IF;
  RETURN result; END $function$;

-- sign_opportunite(4 args) : définition actuelle relue ; changements = suppression de la
-- restriction 6XXX et COALESCE pour ne jamais effacer un rôle déjà saisi
CREATE OR REPLACE FUNCTION public.sign_opportunite(_affaire_id uuid, _new_code text, _chef_projet_id uuid, _dessinateur_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM public.mcp_assert_legacy_oauth_write('sign_opportunite');
  IF NOT public.user_has_cap('action.sign_opportunite') THEN
    RAISE EXCEPTION 'Action réservée : capability action.sign_opportunite requise.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_id := public.sign_opportunite(_affaire_id, _new_code);
  UPDATE public.affaires
     SET chef_projet_id = COALESCE(_chef_projet_id, chef_projet_id),
         dessinateur_id = COALESCE(_dessinateur_id, dessinateur_id)
   WHERE id = v_id;
  RETURN v_id;
END;
$function$;

-- Capability planning.pilotage
INSERT INTO public.capabilities(key, label, description, category, sort_order)
VALUES ('planning.pilotage', 'Planning BE / projets',
        'Lire le planning de pilotage des concepteurs et responsables projet', 'planning', 50)
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_capabilities(role, capability, granted)
SELECT r::public.app_role, 'planning.pilotage', true
FROM unnest(ARRAY['admin','chef_chantier','bureau_etude','commercial']) r
ON CONFLICT DO NOTHING;
```
Vérifié : `sign_opportunite(uuid,text)` renvoie le même identifiant d'affaire (rôles conservés) ; l'archivage est `archived_at`.

## Interface (après validation du SQL)
- `labels.ts` : libellés des 7 rôles, des niveaux, « Presque gagné » et son info-bulle.
- Paramètres > Référents par rôle (admin) : matrice employés × rôles ; les sélecteurs n'utilisent plus `profiles.est_*`.
- Bloc « Équipe projet » partagé (fiche affaire + fiche opportunité) : sélecteur cherchable par rôle (Principaux / Secondaires / Autres actifs), « Nadège – 4 en cours (+3 potentielles) » (lu via `charge_roles_projet()`, mêmes chiffres pour tous), dates pour concepteur et responsable projet, bouton « Planifier » ; rôles filtrés par typologie.
- Badges « rôle à affecter » (fiche + Kanban), colonne Kanban « Presque gagné » avec alerte > 15 jours, filtres / compteurs / exports.
- Planning > « Planning BE / projets » comme décrit précédemment (plein / atténué / hachuré hors totaux, 1/3/6 mois, chevauchements signalés).

## Connecteur Claude
`equipe_projet` dans `fiche_affaire` et `rechercher_affaires`, écriture `affecter_role_projet` (aperçu → confirmation, audit, clé externe) via `app_affecter_role_projet`, lecture `planning_pilotage`, statut `presque_gagne` en lecture et écriture.

## Tests
- SQL (transaction annulée) : liaison smart@setup.paris → Gabin C et contrôle d'ambiguïté, reprise 88/16/1 (dont 53 sur Gabin C), synchronisation dans les deux sens sans boucle, employé sans compte → colonne vide, dates par défaut du responsable projet, effacement des dates via `_remplacer_dates`, signature conserve les rôles, refus OAuth direct, compteur de charge identique pour un commercial et un admin, fusion Kevin (0 référence restante sur toutes les FK).
- Vitest : rôles manquants par statut/typologie, alerte 15 jours, charge réelle vs potentielle, période proposée par « Planifier », chevauchements, ordre des sélecteurs, schémas MCP.
