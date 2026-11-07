-- PROPOSITION NON APPLIQUEE — accord de Gabin requis.
-- Socle additif du lot 1. Les fonctions métier et l'interface seront
-- construites après accord ; aucun changement des droits RH existants.

-- Une fiche technique pointe vers les sources, sans recopier leurs noms,
-- téléphones, permis ou CACES. Le lien employé Dispos reste la référence.
CREATE UNIQUE INDEX dispos_intervenants_employe_unique
  ON public.dispos_intervenants(employe_id) WHERE employe_id IS NOT NULL;

CREATE TABLE public.logistique_personnes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id uuid UNIQUE REFERENCES public.employes(id) ON DELETE RESTRICT,
  intervenant_id uuid UNIQUE REFERENCES public.dispos_intervenants(id) ON DELETE RESTRICT,
  poste text,
  statut text,
  email_externe text,
  chef_equipe boolean NOT NULL DEFAULT false,
  actif boolean NOT NULL DEFAULT true,
  cree_le timestamptz NOT NULL DEFAULT now(),
  maj_le timestamptz NOT NULL DEFAULT now(),
  CHECK (employe_id IS NOT NULL OR intervenant_id IS NOT NULL),
  CHECK (poste IS NULL OR poste IN ('Machiniste','Menuisier','Serrurier','Peintre','CN','Bureau d’étude','ADMIN')),
  CHECK (statut IS NULL OR statut IN ('Permanent','Intermittent','Auto-entrepreneur'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistique_personnes TO authenticated;
GRANT ALL ON public.logistique_personnes TO service_role;
ALTER TABLE public.logistique_personnes ENABLE ROW LEVEL SECURITY;
CREATE POLICY terrain_lecture ON public.logistique_personnes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique') OR public.has_role(auth.uid(),'chef_chantier'));
CREATE POLICY terrain_ecriture ON public.logistique_personnes FOR ALL TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')))
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')));

-- Reprise d'identité uniquement : aucun nom ni champ de paie copié.
INSERT INTO public.logistique_personnes(employe_id, intervenant_id, actif)
  SELECT e.id, d.id, e.actif FROM public.employes e
  LEFT JOIN public.dispos_intervenants d ON d.employe_id=e.id;
INSERT INTO public.logistique_personnes(intervenant_id, actif)
  SELECT d.id, d.actif FROM public.dispos_intervenants d WHERE d.employe_id IS NULL;

CREATE TABLE public.logistique_etape_besoins (
  etape_id uuid PRIMARY KEY REFERENCES public.affaire_etapes_logistiques(id) ON DELETE CASCADE,
  nb_chefs_equipe smallint NOT NULL DEFAULT 0 CHECK (nb_chefs_equipe >= 0),
  besoins_postes jsonb NOT NULL DEFAULT '{}'::jsonb,
  permis_requis text[] NOT NULL DEFAULT '{}'
    CHECK (permis_requis <@ ARRAY['B','C','CE']::text[]),
  caces_requis text[] NOT NULL DEFAULT '{}'
    CHECK (caces_requis <@ ARRAY['R489','R486','autre']::text[]),
  caces_autre text CHECK (char_length(caces_autre)<=60),
  maj_le timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(besoins_postes)='object')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.logistique_etape_besoins TO authenticated;
GRANT ALL ON public.logistique_etape_besoins TO service_role;
ALTER TABLE public.logistique_etape_besoins ENABLE ROW LEVEL SECURITY;
CREATE POLICY besoins_lecture ON public.logistique_etape_besoins FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique') OR public.has_role(auth.uid(),'chef_chantier'));
CREATE POLICY besoins_ecriture ON public.logistique_etape_besoins FOR ALL TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')))
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')));

CREATE TABLE public.logistique_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_fichier text NOT NULL,
  fichier_hash text NOT NULL UNIQUE,
  debut date,
  fin date,
  bilan jsonb NOT NULL DEFAULT '{}'::jsonb,
  cree_par uuid NOT NULL DEFAULT auth.uid(),
  cree_le timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.logistique_imports TO authenticated;
GRANT ALL ON public.logistique_imports TO service_role;
ALTER TABLE public.logistique_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY imports_lecture ON public.logistique_imports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'));
CREATE POLICY imports_ecriture ON public.logistique_imports FOR ALL TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')))
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')));

CREATE TABLE public.logistique_affectations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etape_id uuid NOT NULL REFERENCES public.affaire_etapes_logistiques(id) ON DELETE RESTRICT,
  personne_id uuid NOT NULL REFERENCES public.logistique_personnes(id) ON DELETE RESTRICT,
  jour date NOT NULL,
  role text NOT NULL DEFAULT 'equipier' CHECK (role IN ('chef_equipe','equipier')),
  statut text NOT NULL DEFAULT 'propose' CHECK (statut IN ('propose','valide','confirme','refuse')),
  source text NOT NULL DEFAULT 'manuelle' CHECK (source IN ('manuelle','import_excel','suggestion')),
  heure_debut time,
  heure_fin time,
  fin_jour_suivant boolean NOT NULL DEFAULT false,
  heures_prevues numeric(5,2) CHECK (heures_prevues >= 0 AND heures_prevues <= 24),
  import_id uuid REFERENCES public.logistique_imports(id) ON DELETE RESTRICT,
  supprime_le timestamptz,
  cree_par uuid NOT NULL DEFAULT auth.uid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  maj_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE(etape_id,personne_id,jour)
);
GRANT SELECT, INSERT, UPDATE ON public.logistique_affectations TO authenticated;
GRANT ALL ON public.logistique_affectations TO service_role;
ALTER TABLE public.logistique_affectations ENABLE ROW LEVEL SECURITY;
CREATE POLICY affectations_lecture ON public.logistique_affectations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique') OR public.has_role(auth.uid(),'chef_chantier'));
CREATE POLICY affectations_ecriture ON public.logistique_affectations FOR ALL TO authenticated
  USING ((auth.jwt()->>'client_id') IS NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')))
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')));
CREATE INDEX logistique_affectations_personne_jour ON public.logistique_affectations(personne_id,jour);
CREATE INDEX logistique_affectations_jour ON public.logistique_affectations(jour);

-- Une clé stable par bloc jour/chantier/opération, indépendamment du fichier.
-- Les blocs ambigus (plusieurs horaires le même jour) passent en revue humaine.
CREATE TABLE public.logistique_import_etapes (
  cle text PRIMARY KEY,
  etape_id uuid NOT NULL REFERENCES public.affaire_etapes_logistiques(id) ON DELETE RESTRICT,
  premier_import_id uuid NOT NULL REFERENCES public.logistique_imports(id) ON DELETE RESTRICT,
  cree_le timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.logistique_import_etapes TO authenticated;
GRANT ALL ON public.logistique_import_etapes TO service_role;
ALTER TABLE public.logistique_import_etapes ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_etapes_lecture ON public.logistique_import_etapes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'));
CREATE POLICY import_etapes_ecriture ON public.logistique_import_etapes FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'client_id') IS NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique')));

CREATE TABLE public.logistique_affectations_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affectation_id uuid NOT NULL REFERENCES public.logistique_affectations(id) ON DELETE RESTRICT,
  action text NOT NULL,
  avant jsonb,
  apres jsonb,
  auteur uuid NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.logistique_affectations_historique TO authenticated;
GRANT ALL ON public.logistique_affectations_historique TO service_role;
ALTER TABLE public.logistique_affectations_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY historique_lecture ON public.logistique_affectations_historique FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique') OR public.has_role(auth.uid(),'chef_chantier'));

-- À compléter dans ce même texte avant application, après accord :
-- 1. lecteur équipe terrain, limité aux champs utiles et aux 3 rôles ;
-- 2. garde/triggers identité (liaison Dispos/employé cohérente), besoins,
--    dates d'affectation, audit append-only, rapprochement manuel sous verrou ;
-- 3. RPC d'import atomique avec champs autorisés uniquement, dédoublonnage
--    transversal (jour, affaire, type, personne) et protection des saisies humaines ;
-- 4. lecteur planning avec projection explicite des chantiers/étapes ;
-- 5. capabilities planning_equipes.view/edit attribuées uniquement aux rôles
--    indiqués ; pas d'ajout d'outil MCP, pas de confirmation publique.