-- PROPOSITION NON APPLIQUÉE — accord distinct requis.
-- Aucun devis existant mis à jour ; colonnes devis toutes facultatives sans défaut.
BEGIN;

ALTER TABLE public.parametres_entreprise
  ADD COLUMN IF NOT EXISTS forme_sociale text,
  ADD COLUMN IF NOT EXISTS capital_social_euros numeric(14,2),
  ADD COLUMN IF NOT EXISTS tva_intracom text,
  ADD COLUMN IF NOT EXISTS telephone text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS bic text,
  ADD COLUMN IF NOT EXISTS logo_storage_path text,
  ADD COLUMN IF NOT EXISTS cgv_devis text,
  ADD COLUMN IF NOT EXISTS mentions_devis text,
  ADD COLUMN IF NOT EXISTS mode_reglement text,
  ADD COLUMN IF NOT EXISTS acompte_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS delai_reglement_jours integer;

ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS chantier_adresse text,
  ADD COLUMN IF NOT EXISTS travaux_libelle text,
  ADD COLUMN IF NOT EXISTS travaux_debut date,
  ADD COLUMN IF NOT EXISTS travaux_duree_jours integer,
  ADD COLUMN IF NOT EXISTS signataire_prenom text,
  ADD COLUMN IF NOT EXISTS signataire_nom text,
  ADD COLUMN IF NOT EXISTS signataire_email text,
  ADD COLUMN IF NOT EXISTS signataire_telephone text;

-- Paramètres uniquement : valeurs confirmées par Gabin. Les nouveaux champs
-- IBAN/BIC/téléphone/logo/CGV restent NULL, à saisir dans l'écran paramètres.
UPDATE public.parametres_entreprise
SET adresse_ligne1 = '8 avenue du Président Salvador Allende',
    code_postal = '94400',
    ville = 'Vitry-sur-Seine',
    forme_sociale = 'SA',
    capital_social_euros = 40000,
    naf = '9002Z',
    siret = '95311689400015',
    tva_intracom = 'FR20953116894',
    mode_reglement = 'virement',
    acompte_pct = 50,
    delai_reglement_jours = 30
WHERE singleton = true;

-- Tables existantes : droits et RLS inchangés. Aucune nouvelle table.
COMMIT;