# Atelier et bureau d’étude — socle additif à valider

Le plan général est approuvé. L’inventaire vient d’être relu : 14 chantiers 6XXX actifs, 1 opportunité presque gagnée, aucune période métier.

## Réglages Gabin intégrés
- BE : uniquement Nadège MEVEL et Guillaume MAQUARIE à 100 %, Kevin LEBON et Laurent DEBRANCHE à 50 %.
- Alexandre FERANT, Claude ARECCHIA et Patrick SZMIDT restent dans les référents historiques, mais hors planning BE. Aucun ajout de ces personnes dans la nouvelle vue.
- Impression UV : 1 personne/jour, soit 8 h/jour.
- Machiniste : capacité vide, charge en heures uniquement ; aucun pourcentage ni alerte de surcharge.

## Première modification de base proposée
Ce socle ajoute uniquement les champs nécessaires aux structures existantes. Aucune nouvelle table, aucune suppression, aucun changement de contrat ou rémunération, aucune publication. Il n’est pas encore appliqué.

```sql
ALTER TABLE public.affaire_planning_metier
  ADD COLUMN IF NOT EXISTS heures_prevues numeric
  CHECK (heures_prevues IS NULL OR heures_prevues >= 0);

ALTER TABLE public.affaires
  ADD COLUMN IF NOT EXISTS atelier_date_debut date,
  ADD COLUMN IF NOT EXISTS atelier_date_fin date,
  ADD COLUMN IF NOT EXISTS atelier_heures_prevues numeric
  CHECK (atelier_heures_prevues IS NULL OR atelier_heures_prevues >= 0);

ALTER TABLE public.role_referents
  ADD COLUMN IF NOT EXISTS capacite_be_pct numeric NOT NULL DEFAULT 100
  CHECK (capacite_be_pct >= 0 AND capacite_be_pct <= 100),
  ADD COLUMN IF NOT EXISTS visible_planning_be boolean NOT NULL DEFAULT false;

-- Initialisation des nouveaux champs uniquement pour les quatre concepteurs.
UPDATE public.role_referents SET
  visible_planning_be = true,
  capacite_be_pct = CASE
    WHEN employe_id IN ('68f44ab5-c3a0-4514-9c7b-5ae0fd54290f'::uuid,
                       '23844cc6-b506-4ce0-8872-072230aaa913'::uuid) THEN 50
    ELSE 100 END
WHERE role = 'concepteur' AND employe_id IN (
  '68f44ab5-c3a0-4514-9c7b-5ae0fd54290f'::uuid,
  '23844cc6-b506-4ce0-8872-072230aaa913'::uuid,
  'c77dfa4d-53df-4f9a-beee-5c0d61d18e58'::uuid,
  'd84b7bdf-9260-4022-bb45-ba1a8d2c57c2'::uuid
);

COMMENT ON COLUMN public.affaire_planning_metier.heures_prevues IS
  'Planning atelier simple : heures prévues par métier, sans staffing nominatif';
COMMENT ON COLUMN public.affaires.atelier_date_debut IS
  'Planning atelier simple : début global validé manuellement';
COMMENT ON COLUMN public.affaires.atelier_date_fin IS
  'Planning atelier simple : fin globale validée manuellement';
COMMENT ON COLUMN public.affaires.atelier_heures_prevues IS
  'Planning atelier simple : estimation globale facultative en heures';
COMMENT ON COLUMN public.role_referents.capacite_be_pct IS
  'Capacité de planification BE en pourcentage, sans lien avec le contrat ni la rémunération';
COMMENT ON COLUMN public.role_referents.visible_planning_be IS
  'Concepteur visible dans le planning BE ; référents historiques conservés hors planning';
```

## Réglage des capacités existantes — présenté séparément
Ces deux mises à jour de valeurs existantes seront exécutées séparément de la migration, uniquement après votre accord. Aucun autre métier n’est modifié.

```sql
UPDATE public.metiers SET capacite_jour = 1
WHERE id = 9 AND code = 'impression_uv';

UPDATE public.metiers SET capacite_jour = NULL
WHERE id = 6 AND code = 'machiniste';
```

## Étape suivante
Après accord sur ce SQL exact : appliquer le socle, puis présenter séparément les fonctions et protections d’écriture avant leur application. Les droits actuels de planning métier permettent encore des modifications aux commerciaux ; la nouvelle vue devra les limiter aux administrateurs, à la logistique et aux chefs atelier, sans casser les lecteurs existants. Aucun écran incomplet ne remplacera le planning BE actuel avant cette validation.

Les règles communes de charge, jours ouvrés/fériés, propositions de dates et déplacement ont été commencées sans écriture de données.