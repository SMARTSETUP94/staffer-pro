# Exports devis — migration additive à valider

Le plan de corrections est approuvé. Cette étape soumet uniquement les colonnes et les valeurs entreprise ci-dessous ; aucune écriture de base n’a été exécutée.

## Valeurs confirmées
- Adresse actuelle : **8, avenue du Président Salvador Allende, 94405 Vitry sur Seine Cedex**.
- Adresse proposée : **8 avenue du Président Salvador Allende, 94400 Vitry-sur-Seine**.
- Forme : SA ; capital : 40 000 € ; APE : 9002Z ; SIRET : 95311689400015 ; TVA : FR20953116894.
- Virement ; acompte 50 % ; délai 30 jours.
- La raison sociale et l’adresse sont reprises des paramètres entreprise, pas copiées dans les devis historiques.

## Champs actuellement absents, à remplir par Gabin
**Téléphone, IBAN, BIC, logo SET UP et CGV** n’existent pas dans la fiche entreprise actuelle. Les champs seront créés vides ; aucune coordonnée bancaire à transmettre dans le chat. L’écran des paramètres permettra leur saisie après application et raccordement.

## Périmètre de cette migration
- Aucune nouvelle table ; droits et accès existants conservés.
- Huit colonnes facultatives sur les devis, sans défaut : adresse chantier, travaux, début, durée, prénom/nom/email/téléphone du signataire. Aucun devis existant rempli, modifié, validé ou envoyé automatiquement.
- Douze champs dans les paramètres entreprise pour les informations du modèle.
- Mise à jour uniquement de la fiche entreprise avec les valeurs explicitement confirmées ci-dessus.
- Les lecteurs et les fonctions d’édition seront raccordés ensuite ; leurs redéfinitions seront également montrées avant toute application.

## SQL exact proposé — non appliqué
```sql
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
COMMIT;```

## Suite du lot après accord
- Garder Temps prévu dans l’Excel interne ; options « Option : … » converties manuellement dans ProGBat, sans marqueur supposé.
- Raccorder le modèle PDF détaillé et synthétique aux paramètres et aux champs signataire/chantier.
- Compléter les contrôles et produire le bilan vérifié/non vérifié avec captures avant/après de 9500-R1, 9477-R1 et 6064-R1.
- Les anciennes captures temporaires ne sont plus disponibles dans le sandbox : retrouver les anciens PDF d’audit s’ils sont conservés, sinon signaler explicitement la limite des captures « avant », sans les présenter comme des originaux.
- Rien publié ; aucun devis existant modifié.
