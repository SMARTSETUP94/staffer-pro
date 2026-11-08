# Atelier et bureau d’étude — socle additif à valider

Le plan général est approuvé. L’inventaire vient d’être relu : 14 chantiers 6XXX actifs, 1 opportunité presque gagnée, aucune période métier. Les capacités correspondent au plan ; Impression UV et Machiniste restent non renseignés.

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
  CHECK (capacite_be_pct >= 0 AND capacite_be_pct <= 100);

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
```

## Étape suivante
Après accord sur ce SQL exact : appliquer le socle, puis présenter séparément les fonctions et protections d’écriture avant leur application. Les droits actuels de planning métier permettent encore des modifications aux commerciaux ; la nouvelle vue devra les limiter aux administrateurs, à la logistique et aux chefs atelier, sans casser les lecteurs existants. Aucun écran incomplet ne remplacera le planning BE actuel avant cette validation.

Les règles communes de charge, jours ouvrés/fériés, propositions de dates et déplacement ont été commencées sans écriture de données.