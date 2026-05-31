---
name: heures-saisie-source-unique
description: Toute saisie/édition de heures_saisies passe par src/lib/heures-upsert.ts ; INSERT/UPDATE direct interdit hors helper et whitelist.
type: constraint
---

# Saisie d'heures — source unique

Depuis v0.52, **toutes** les surfaces de saisie d'heures (création/édition
d'une ligne `heures_saisies`) doivent router leurs INSERT/UPDATE via :

- `upsertHeuresSaisie(client, input, opts?)` — lookup (employe,date,affaire) + UPDATE ou INSERT
- `insertHeuresSaisie(client, input, opts?)` — INSERT direct
- `patchHeuresSaisie(client, id, patch, opts?)` — UPDATE patch ciblé (préserve les autres colonnes)
- `insertHeuresSaisieBatch(client, inputs[], opts?)` — pour BulkSaisieDialog

Source : `src/lib/heures-upsert.ts`. Le payload est construit par
`buildHeuresSaisiePayload(input)` qui garantit que **tous** les champs sont
alimentés (ou explicitement `null`) — interdit l'oubli silencieux d'un champ
4XXX/5XXX.

## Garde-fou

Test `src/lib/__tests__/heures-saisie-source-unique-guard.test.ts` grep
tous les fichiers et liste les `.from("heures_saisies").(insert|update)`
hors helper. Si CI rouge → refactor vers le helper.

## Whitelist autorisée

- `src/hooks/use-mes-heures.ts` — consomme le helper pour patch/insert ; upsert assignation_id en bulk autorisé.
- `src/routes/_app.validation-heures.tsx` — transitions de statut (valide/rejete).
- `src/routes/_app.heures-analyse.tsx` — transitions de statut.
- `src/routes/_app.devis.rattachement-historique.tsx` — rattachement devis_id a posteriori.
- `src/lib/business-errors.ts` — commentaire de doc.

## Surfaces couvertes

| Surface | Route | Composant | Helper utilisé |
|---|---|---|---|
| MesHeuresGrid (desktop+mobile) | `/mes-heures` | `MesHeuresGrid` + `AddHorsPlanningDialog` | `useMesHeures` → `patchHeuresSaisie` / `insertHeuresSaisie` |
| Saisie pour employé | `/saisie-pour-equipe`, `/validation-heures` | `SaisirPourEmployeDialog` | `upsertHeuresSaisie` |
| Bulk équipe | `/saisie-pour-equipe` | `BulkSaisieDialog` | `insertHeuresSaisieBatch` |
| Mission inline | `/missions/$affaireId/$phase` | route inline | `upsertHeuresSaisie` |

Statut par défaut différencié par appelant (`brouillon` pour grille employé,
`soumis` pour `/missions`, `valide` pour chef). Le helper ajoute
automatiquement `valide_par` + `valide_le` quand `statut === "valide"`.
