---
name: LOT 3 — Modèle de données grille de fabrication
description: Source de vérité des heures objet×métier (objet_heures_metier), lots de fabrication, planning atelier prévisionnel et vue de charge jour
type: feature
---

# LOT 3 — Modèle de données (fondation grille de fabrication)

Lot **DB uniquement** (aucune UI). Prépare le lot 4 (grille tableur éditable).

## 1. `objet_heures_metier` — SOURCE DE VÉRITÉ des heures prévues

`(objet_id, metier_id)` UNIQUE, `heures_prevues >= 0`, `origine ∈ ('devis','ajout')`,
`note`, `sous_traitance`, `created_by`, timestamps.

**Règle** : c'est la table qu'on écrit. Les 7 colonnes `fabrication_objets.heures_prevues_*`
sont désormais un **cache en lecture**, maintenu par le trigger
`trg_ohm_sync` → `sync_objet_heures_colonnes()` (AFTER INSERT/UPDATE/DELETE, SECURITY DEFINER).
Elles restent consommées par l'algo de staffing (`ObjetInput`), la fiche objet et la MV
`v_objet_heures_consolidees` — ne jamais les supprimer.

Mapping colonne ↔ `metiers.id` : be→8, numerique→4, bois→1, metal→2, peinture→3,
tapisserie→5, manutention→7.

Données existantes migrées avec `origine='devis'` (uniquement heures > 0).

RLS : SELECT si `is_chef_or_admin()` ou `user_has_affaire_access(fab_objet_affaire_id(objet_id))` ;
écriture `is_chef_or_admin()`.

## 2. `fabrication_lots` — regroupement de planification

`affaire_id`, `nom`, `ordre`, `couleur`. Plus `fabrication_objets.lot_id` (FK ON DELETE SET NULL).

**Règle absolue : les heures vivent sur l'objet, JAMAIS sur le lot.** Le lot ne sert qu'à
planifier et affecter des personnes en bloc.

Cohérence garantie par `trg_objet_lot_coherence` / `guard_objet_lot_meme_affaire()` :
un objet ne peut pointer que vers un lot de sa propre affaire.

## 3. `atelier_planning` — effectif prévisionnel anonyme (temps 1)

`affaire_id`, `objet_id` OU `lot_id` (CHECK au moins un), `metier_id`, `date`,
`nb_pers` (1..30), `note`. Index `(affaire_id,date)`, `(metier_id,date)`, `(objet_id)`, `(lot_id)`.

RLS : lecture via accès affaire ; écriture `is_chef_or_admin()` ou
`current_user_has_capability('section.planning_fab')`.

## 4. Nommage (temps 2)

`assignations.atelier_planning_id` (FK ON DELETE SET NULL) — relie une personne nommée
à la ligne d'effectif prévisionnel. Champ **optionnel** ; `src/lib/assignation-upsert.ts`
(source unique protégée par test-gardien) n'est pas modifié au-delà du type.

## 5. `v_atelier_charge_jour` (security_invoker)

`metier_id, metier_libelle, capacite_jour, date, nb_pers_total, nb_affaires, nb_pers_nommees`
agrégée depuis `atelier_planning` + `assignations`. Servira au lot 6 (charge atelier).

## Vérifications faites
- Miroir testé : UPDATE `objet_heures_metier` → `fabrication_objets.heures_prevues_bois` suit.
- 80 lignes migrées, types Supabase TS regénérés.
- Tests rouges restants = 21 pré-existants (typologie/dashboard/capabilities), voir
  mem://debts/tests-rouges-preexistants — aucune régression introduite par ce lot.
