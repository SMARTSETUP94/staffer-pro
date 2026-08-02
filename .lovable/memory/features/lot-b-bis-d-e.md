---
name: Lot B-bis / D / E — validation deux temps, CNC non bloquante, rappel atelier
description: Validation d'étape en 2 temps (terminer_etape → en_attente_validation → valider_etape), conflit CNC converti en avertissement soft, source inbox atelier_rappel, bloc Mon atelier scopé fabrication/prototype.
type: feature
---
# Lots B-bis / D / E (2 juin 2026)

## B-bis — Validation en deux temps
- RPC `terminer_etape(_etape_id, _commentaire)` : statut → `en_attente_validation`, pose `date_fin`, log `etape_statut_change`. Appelable par l'assignee, l'équipe de l'objet (`fabrication_objet_equipe`), le respo_fab ou un admin. Renvoie `{ ok, error }`, ne lève jamais.
- **Exception** : sur l'étape `respo_fab`, `terminer_etape` délègue à `valider_etape` (une seule action).
- `valider_etape` inchangée (respo_fab de l'objet ou admin, juge-et-partie interdit hors `respo_fab`).
- UI : helper pur `actionCarte(etape, {isAdmin,isRespoFab})` dans `src/lib/atelier-board.ts` → `terminer` / `valider` / `aucune`. Carte en attente = bordure + fond ambre.

## D1 — CNC : avertissement, plus blocage
- `NUM_CONFLIT_INSOLUBLE` renommé `NUM_CHEVAUCHEMENT_CNC`, `severity: "soft"`. Le créneau est **toujours posé** (`numStart ?? objStart`).
- La CNC ne pourra jamais être tenue en binôme (`metiers.capacite_jour = 1`, une seule personne staffable) : c'est un état permanent, signalé sobrement, jamais un rappel récurrent.
- `ResolveCncConflictDialog` reste accessible : elle **propose** un décalage de livraison, elle n'impose rien.

## D2 — Source inbox `atelier_rappel`
- Un seul motif : plan technique non publié (`plan_url` NULL **et** aucun PDF lié dans `affaire_documents`) sur un objet dont `usinage` ou `respo_fab` est applicable et non terminée.
- Datation par repli : prochain créneau `atelier_planning` → `affaires.date_montage` → aucune (« sans échéance », severity `low`).
- Cap `inbox.atelier_rappel` (catalogue + `capabilities`), accordée à `admin` et `bureau_etude`.

## E — Bloc « Mon atelier »
`getMesObjetsAtelier` filtre sur `getAffaireTypologie` ∈ {`fabrication` (5XXX/6XXX), `prototype` (9XXX)}, en plus du scope équipe existant. Bloc masqué si aucun objet.

## Nettoyage
`useCapability("objet.read")` (clé hors catalogue) supprimé de la fiche objet — seul `objet.view` subsiste.
