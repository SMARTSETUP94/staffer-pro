---
name: vocabulaire-metier-centralise
description: Vocabulaire métier UI (Staffer→Assigner, Auto-staffing→Auto-remplir, Plan staffing→Plan de fab, Validation→Valider) centralisé via useVocab() derrière flag vocab_metier_v1 (Lot 7.1 bis)
type: constraint
---

Tous les libellés métier UI passent par `src/lib/labels.ts` (maps `VOCAB_LABELS_NEXT` / `VOCAB_LABELS_LEGACY`) résolus via le hook `useVocab()` (`src/hooks/use-vocab.ts`).

JAMAIS de string dur :
- « Staffer en bulk », « Staffer rapide »
- « Auto-staffing », « Auto-staff complet », « Auto-staff plan complet », « Auto-staff terminé »
- « Plan staffing »
- « Validation heures » (sauf comme légende historique)
- « Mettre au planning » (label de bouton CTA)

EXCEPTION assumée : **Express** reste tel quel (mot français court, compris : TGV Express, livraison Express). Aucune entrée vocab pour ce terme.

Mapping principal :
| Clé vocab | LEGACY | NEXT (flag on) |
|---|---|---|
| `assignerEnLot` | Staffer en bulk | Assigner en lot |
| `assignerPonctuel` | Staffer rapide | Assigner ponctuel |
| `assignerPonctuelCourt` | Staffer rapide | Assigner vite |
| `autoRemplir` | Auto-staffing | Auto-remplir |
| `autoRemplirComplet` | Auto-staff complet | Auto-remplir complet |
| `autoRemplirPlanComplet` | Auto-staff plan complet | Auto-remplir plan complet |
| `autoRemplirTermine` | Auto-staff terminé | Auto-remplir terminé |
| `autoRemplirStepLabel` | Auto-staff | Auto-remplir |
| `autoRemplirFabrication` | Auto-staffing fabrication | Auto-remplir fabrication |
| `autoRemplirFabrication5XXX` | Auto-staffing Fabrication 5XXX | Auto-remplir Fabrication 5XXX |
| `planDeFab` | Plan staffing | Plan de fab |
| `validerHeures` | Validation heures | Valider heures |
| `validerHeuresLong` | Validation heures | Valider les heures de l'équipe |

Flag DB : `vocab_metier_v1` (OFF par défaut, activable per-user via `enabled_for_user_ids`). Voir migration 20260523_seed_vocab_metier_v1.

**Why** : (1) rollback instantané si retour terrain négatif, (2) éviter le jargon anglo-tech, (3) tester sur un sous-ensemble d'utilisateurs avant bascule globale.

**How to apply** :
- Nouveau composant qui affiche un label métier : `const vocab = useVocab(); ... {vocab.assignerEnLot}`.
- Contexte non-React (head/meta SSR) : utiliser directement le label NEXT en dur (rollback non critique pour SEO).
- Fonction utilitaire qui doit recevoir des libellés : passer la map en paramètre (`vocab: Record<VocabKey, string>`), ne pas appeler `useVocab()` hors composant.
- Technique INCHANGÉ : routes (`/staffing/$planId`, `/staffer-mobile`, `/validation-heures`), queryKeys, noms de RPC/serverFn, noms de composants TS (`MettreAuPlanningExpressButton`, `BulkStafferDialog`, `StafferMobileForm`).

**Cleanup deadline (CRITIQUE)** : 2 semaines après bascule `enabled_globally=true` du flag `vocab_metier_v1`. Au-delà :
1. Supprimer `VOCAB_LABELS_LEGACY` dans `src/lib/labels.ts`.
2. Simplifier `useVocab()` pour qu'il retourne directement `VOCAB_LABELS_NEXT` (ou inliner les strings).
3. Supprimer les regex tolérantes `/Staffer|Assigner/i` dans les specs E2E, remplacer par matchers stricts.
4. PR de cleanup dédiée + drop du flag DB.

Tests : `src/lib/__tests__/labels.test.ts` couvre `resolveVocab`, parité des clés NEXT/LEGACY, absence d'« Express » dans les maps.
