---
name: Bloc 10.3 — Fiche opportunité enrichie (UI)
description: Route /opportunites/$affaireId — header, jalons, timeline actions, brief commercial, équipe, devis, journal. Navigation câblée depuis Kanban + Tableur.
type: feature
---

# Bloc 10.3 — Fiche opportunité (UI)

Route dédiée pour piloter une opportunité avant signature (avant que `/affaires/$id` chantier ne prenne le relais).

## Route

`src/routes/_app.opportunites.$affaireId.tsx`
- Cap implicite via menu sidebar (`section.opportunites`)
- Sécurité RLS Supabase : admin = tout, CA = ses propres via `charge_affaires_id`
- Sections inlinées dans le fichier route (Brief, Timeline, Équipe, Devis, Journal) — composants extractés uniquement pour les blocs réutilisables / interactifs lourds

## Composants extraits (3)

`src/components/opportunites/fiche/`
1. **`OpportuniteFicheHeader`** — numéro, code, client, lieu, taille, statut Kanban, bouton « Signer ».
2. **`OpportuniteJalonsBar`** — pipeline 4 étapes (qualification → devis → négociation → signature) avec badge statut.
3. **`OpportuniteNextActionCard`** — dernière action + due date + formulaire ajout action.

Décision UX : Brief / Timeline / Équipe / Devis / Journal restent **inlinés** dans la route (lecture simple, pas de réutilisation ailleurs). Header + JalonsBar + NextActionCard extraits car cohésion forte + UI dense.

## Server functions (1 fichier, 4 fonctions)

`src/server/opportunite-fiche.functions.ts`
1. **`getOpportuniteFiche(affaireId)`** — agrège affaire + jalons + 10 dernières actions + équipe `commercial_etude` + devis + commentaires.
2. **`updateOpportuniteFields(affaireId, patch)`** — patch partiel des champs commerciaux du brief.
3. **`addOpportuniteAction(affaireId, payload)`** — INSERT timeline (type, date, texte, prochaine_action_due_le).
4. **`updateJalonStatus(affaireId, etape, …)`** — UPDATE `opportunite_jalons`.

Toutes protégées par `requireSupabaseAuth`. Scope appliqué par RLS, pas en applicatif.

## Caps utilisées

- `section.opportunites` — accès route (via menu)
- `action.edit_opportunite` — édition du brief + ajout d'actions
- `action.sign_opportunite` — bouton « Signer »
- `opportunites.read.all` vs `opportunites.read.mine` — déjà gérés par RLS

## Navigation câblée

- **Kanban (`OpportuniteCard`)** : clic sur le corps de la carte → `/opportunites/$affaireId`. Drag handle + dropdown delete + bouton signer gardés (stopPropagation).
- **Tableur (`OpportunitesTableurView`)** : nouveau bouton icône `ExternalLink` dans la colonne actions → `/opportunites/$affaireId`. Lignes éditables non-cliquables (préserve UX saisie inline).

## Tests

- Vitest : `src/server/__tests__/opportunite-fiche.test.ts` — smoke sur enums (`OPP_ACTION_TYPES`, `OPP_JALON_ETAPES`) et présence des 4 server fns.
- E2E : `e2e/bloc-10/fiche-opportunite.spec.ts` — admin ouvre la fiche depuis le tableur, ajoute une action, signe l'opp.

## Lien

Analyse initiale : [bloc-10-fiche-opportunite-analyse.md](./bloc-10-fiche-opportunite-analyse.md)
Fondations DB : [bloc-10-1-fondations-db.md](./bloc-10-1-fondations-db.md)

## Hors scope (reportés)

- Visites chantier (table dédiée + photos) → 10.4
- Échantillons matériaux → 10.5
- Moodboard / artefacts storage → 10.6
- UI mobile « nouvelle visite »
- Champs `proba_signature` / `valeur_estimee_centimes` (10.3-bis si demandé)
