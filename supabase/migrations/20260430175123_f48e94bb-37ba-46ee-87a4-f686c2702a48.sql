-- v0.31.2 hotfix : la contrainte UNIQUE globale sur fabrication_objets.reference
-- bloquait les imports/ré-imports de devis quand deux affaires partagent
-- une même référence d'objet (ex. "OBJ-01"). On la remplace par une
-- unicité par affaire, qui correspond à la sémantique réelle du métier.

ALTER TABLE public.fabrication_objets
  DROP CONSTRAINT IF EXISTS fabrication_objets_reference_key;

ALTER TABLE public.fabrication_objets
  ADD CONSTRAINT fabrication_objets_affaire_reference_key
  UNIQUE (affaire_id, reference);