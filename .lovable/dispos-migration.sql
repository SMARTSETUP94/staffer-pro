-- Module Dispos — migration proposée (NON appliquée)

-- 1. Intervenants externes
CREATE TABLE public.dispos_intervenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL CHECK (char_length(nom) BETWEEN 2 AND 80),
  telephone text NOT NULL CHECK (telephone ~ '^0[67][0-9]{8}$'),
  statut text NOT NULL CHECK (statut IN ('intermittent','auto_entrepreneur','autre')),
  actif boolean NOT NULL DEFAULT true,
  employe_id uuid REFERENCES public.employes(id) ON DELETE SET NULL,
  a_valider boolean NOT NULL DEFAULT false,   -- nouveau téléphone pour un nom connu
  jeton_hash text UNIQUE,                     -- sha256 du jeton navigateur, jamais le jeton en clair
  cree_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telephone)
);

-- 2. Semaines ouvertes
CREATE TABLE public.dispos_semaines (
  debut date PRIMARY KEY CHECK (extract(isodow FROM debut) = 1),
  heure_limite timestamptz NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now()
);

-- 3. Dispos par personne et par jour
CREATE TABLE public.dispos_jours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervenant_id uuid NOT NULL REFERENCES public.dispos_intervenants(id) ON DELETE CASCADE,
  jour date NOT NULL,
  journee boolean NOT NULL DEFAULT false,
  soiree boolean NOT NULL DEFAULT false,
  pas_dispo boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'formulaire' CHECK (source IN ('formulaire','saisie_logistique')),
  maj_le timestamptz NOT NULL DEFAULT now(),
  maj_par uuid,
  UNIQUE (intervenant_id, jour),
  CHECK (NOT (pas_dispo AND (journee OR soiree)))
);

-- Note hebdomadaire (« Un mot pour Alberto »)
CREATE TABLE public.dispos_notes (
  intervenant_id uuid NOT NULL REFERENCES public.dispos_intervenants(id) ON DELETE CASCADE,
  semaine date NOT NULL REFERENCES public.dispos_semaines(debut) ON DELETE CASCADE,
  note text CHECK (char_length(note) <= 500),
  envoye_le timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intervenant_id, semaine)
);

-- Limitation de débit (par IP et par jeton, fenêtre 10 min)
CREATE TABLE public.dispos_rate_limit (
  cle text NOT NULL,
  fenetre timestamptz NOT NULL,
  nb int NOT NULL DEFAULT 0,
  PRIMARY KEY (cle, fenetre)
);

-- Droits : AUCUN accès anonyme direct aux tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispos_intervenants, public.dispos_jours,
  public.dispos_semaines, public.dispos_notes TO authenticated;
GRANT ALL ON public.dispos_intervenants, public.dispos_jours, public.dispos_semaines,
  public.dispos_notes, public.dispos_rate_limit TO service_role;

ALTER TABLE public.dispos_intervenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispos_jours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispos_semaines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispos_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispos_rate_limit ENABLE ROW LEVEL SECURITY; -- aucune policy = fermé

-- Lecture/écriture : logistique + direction (admin) uniquement
CREATE POLICY "dispos_logistique" ON public.dispos_intervenants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'));
CREATE POLICY "dispos_logistique" ON public.dispos_jours FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'));
CREATE POLICY "dispos_logistique" ON public.dispos_semaines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'));
CREATE POLICY "dispos_logistique" ON public.dispos_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'logistique'));

-- Fonctions publiques (SECURITY DEFINER, seules accessibles à anon), validant tout :
--  dispos_public_semaine()                      -> semaine suivante + heure limite (défaut vendredi 12 h Paris)
--  dispos_public_identifier(nom, tel, statut)   -> jeton aléatoire (32 octets) ; téléphone connu = même personne ;
--                                                  nom connu + nouveau téléphone = fiche « à valider », sans écraser
--  dispos_public_moi(jeton)                     -> prénom + dispos semaine ouverte + semaine précédente (« comme la semaine dernière »)
--  dispos_public_enregistrer(jeton, jours jsonb, note)
--        -> refuse si heure limite dépassée, si un jour hors des 7 jours ouverts, valeurs non booléennes,
--           note > 500 car. ; débit max 20 appels / 10 min par IP (en-tête x-forwarded-for) et par jeton
-- REVOKE ALL ... FROM public ; GRANT EXECUTE ... TO anon, authenticated  (corps complet écrit à l'application)
