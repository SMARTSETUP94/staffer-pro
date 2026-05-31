# Centraliser la saisie d'heures sur une source unique

## État des lieux (audit)

5 surfaces saisissent dans `heures_saisies`, avec **3 implémentations indépendantes** du INSERT/UPDATE et des champs **incohérents** entre elles :

| Surface | Route | Composant | Mutation | Champs manquants |
|---|---|---|---|---|
| 1 | `/mes-heures` (desktop + mobile) | `MesHeuresGrid` + `AddHorsPlanningDialog` | `useMesHeures.upsertSaisie` ✅ | — référence |
| 2a | `/saisie-pour-equipe` | `SaisirPourEmployeDialog` | `supabase` direct inline | OK champs |
| 2b | `/saisie-pour-equipe` | `BulkSaisieDialog` | `supabase` direct inline | ❌ commentaire, étape 4XXX, fab 5XXX |
| 3 | `/validation-heures` | `SaisirPourEmployeDialog` (réutilisé) | — | — |
| 4 | `/missions/$affaireId/$phase` | formulaire **inline** dans la route | `supabase` direct inline | ❌ heures_nuit (forcé 0), étape 4XXX, fab 5XXX |

**Conséquences concrètes** :
- Sur 4XXX et 5XXX, la saisie depuis `/missions` et `/saisie-pour-equipe` bulk **perd silencieusement** la phase et le lien objet.
- `heures_nuit` n'existe pas dans le module `/missions` (forcé à 0).
- Une évolution future (nouveau champ, nouvelle règle métier) doit être répliquée dans 3 endroits — risque de divergence garanti.

## Objectif

Une seule fonction d'upsert qui couvre **tous** les champs (`heure_debut`, `heure_fin`, `duree_pause_minutes`, `heures_reelles`, `heures_nuit`, `etape_chantier`, `fabrication_objet_id`, `fabrication_etape_type`, `commentaire`, `statut`), utilisée par les 4 composants.

## Plan d'exécution

### 1. Extraire un helper pur (`src/lib/heures-upsert.ts`)
- Fonction `upsertHeuresSaisie(client, input)` qui :
  - Cherche une ligne existante `(employe_id, date, affaire_id)`.
  - Construit le payload complet (tous les champs ci-dessus + `valide_par`/`valide_le` si `statut='valide'`).
  - Fait UPDATE ou INSERT et renvoie la ligne.
- Type `HeuresUpsertInput` unique exporté.
- Tests unitaires sur la construction du payload (4XXX vs 5XXX vs neutre, statut, override nuit).

### 2. Refactor `useMesHeures.upsertSaisie`
- Remplacer le code SQL inline par un appel à `upsertHeuresSaisie(supabase, …)`. Comportement identique.

### 3. Refactor `SaisirPourEmployeDialog`
- Remplacer le bloc `supabase.from("heures_saisies")…` par `upsertHeuresSaisie(supabase, {…, statut:"valide"})`.

### 4. Refactor `BulkSaisieDialog`
- Boucle d'appels à `upsertHeuresSaisie` (ou variante batch). Ajout des champs manquants : `commentaire` (optionnel global de la modale), `etape_chantier` (si toutes les affaires 4XXX), `fabrication_*` (si 5XXX) — sinon `null`.
- Conserve la perf : si une seule affaire, l'UI peut proposer ces champs ; sinon laisser `null` mais utiliser le même helper.

### 5. Refactor `/missions/$affaireId/$phase` (inline)
- Extraire le formulaire actuel dans un petit composant `<MissionHeuresForm>` réutilisable, qui appelle `upsertHeuresSaisie`.
- Ajouter le bloc `heures_nuit` collapsible (cohérence) et, si l'affaire est 4XXX/5XXX, le sélecteur d'étape/objet correspondant (déjà identifié par le contexte de la route — phase est connu pour 4XXX).

### 6. Garde-fou
- Ajouter une règle ESLint custom **ou** un test `vitest` qui grep le code et **interdit** tout nouvel appel direct `supabase.from("heures_saisies").insert|update` hors de `src/lib/heures-upsert.ts` et `src/hooks/use-mes-heures.ts`.

### 7. Vérifications
- `bunx tsc --noEmit`
- Tests existants : `mes-heures-*.test.ts`, `hors-planning-helpers.test.ts`
- Smoke manuel : créer/éditer une saisie sur les 4 surfaces avec une affaire 4XXX puis 5XXX.

## Détails techniques

- **Statut par défaut** reste différencié selon l'appelant (`brouillon` pour employé self, `soumis` pour `/missions`, `valide` pour chef) — paramètre `statut` de `HeuresUpsertInput`.
- Le helper attache automatiquement `valide_par = user.id` et `valide_le = now()` quand `statut === "valide"`.
- Pas de migration SQL.
- Pas de changement RLS.

## Hors scope

- Refonte UI cross-surface (look identique partout) — on garde l'UI propre à chaque surface, on unifie uniquement la **logique** d'écriture.
- `staffer-mobile` non confirmé comme surface de saisie ; je vérifierai en passant.

## Livrables

- `src/lib/heures-upsert.ts` (+ tests)
- 4 composants refactorés
- 1 garde-fou (test ou règle ESLint)
- Mémoire `mem://constraints/heures-saisie-source-unique.md`
- Entrée roadmap dans `mem://index.md`
