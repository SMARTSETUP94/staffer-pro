---
name: Sprint 1 stabilité v0.39.1
description: Audit RLS heures_saisies + 2 tests E2E (chef→employé, auto-staffing v0.39) + audit mutations client + auth-context shallow setSession
type: feature
---

# v0.39.1 Sprint 1 — STABILITÉ & CONFIANCE (4 mai 2026)

5 actions livrées (Gabin valide). API Claude (v0.41) reportée au backlog.

## ✅ Action 1 — Audit RLS heures_saisies (3h)

**Verdict** : la policy `heures_saisies_self_select` autorise déjà
`employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())`
→ **la RLS n'est PAS la cause du BUG #33**.

Causes restantes à investiguer (hors RLS, traitées en v0.39.2 via RPC #2) :
- `employe_id` mal renseigné côté `SaisirPourEmployeDialog`
- Cache `useMesHeures` / race condition login

Matrice complète : `docs/rls-policies.md` (création).

## ✅ Action 2 — E2E chef→employé heures (4h)

`e2e/heures/chef-saisit-pour-employe.chef.spec.ts` (4 tests CSPE1–4) :
- Chef accède /saisie-pour-equipe
- Employé voit /mes-heures sans erreur RLS (anti-régression #33)
- Employé voit /ma-semaine
- Employé voit /mobile/heures

Tolérant fixtures : skip propre si `e2e/.auth/employe.json` absent.

## ✅ Action 3 — E2E auto-staffing v0.39 Vue 1/2/3 (4h)

`e2e/staffing/auto-staffing-v039.chef.spec.ts` (5 tests AS1–5) :
- /affaires accessible
- Plan staffing ouvrable
- Header AM/PM Vue 1
- Bouton "Re-staffer nominatif" Vue 3
- KPI "Heures staffées" présent (anti-régression 744h fantôme v0.39.0b)

## ✅ Action 4 — Audit mutations client (2h)

`docs/audit-mutations-client-v0391.md` : 42 occurrences sur 30 fichiers.

**Top 5 à migrer en RPC SECURITY DEFINER** :
1. `use-bulk-assign-objet.ts` — multi-table avec rollback manuel best-effort
2. `SaisirPourEmployeDialog.tsx` — cause probable BUG #33
3. `BulkSaisieDialog.tsx` — partial commit possible
4. `use-feuille-route-tableur.ts` — cross-table affaires + lignes
5. `ParChantierAssignDialog.tsx` + `BulkStafferDialog.tsx` — bulk N×M

Plan : v0.39.2 → #1+#2 ; v0.39.3 → #3+#5 ; v0.40 → #4.

## ✅ Action 5 — auth-context shallow setSession (30min)

`src/lib/auth-context.tsx` L131+ : guard shallow-eq sur
`access_token + refresh_token + user.id` avant `setSession(newSession)`.
Évite re-render cyclique sur SIGNED_IN/INITIAL_SESSION/TOKEN_REFRESHED
ré-émis au refocus tab. Généralise le pattern déjà appliqué sur `setUser`
en v0.39.0f.

## Fichiers livrés

- `docs/rls-policies.md` (NEW) — matrice RLS acteur×action×table
- `docs/audit-mutations-client-v0391.md` (NEW) — Top 5 + plan
- `e2e/heures/chef-saisit-pour-employe.chef.spec.ts` (NEW)
- `e2e/staffing/auto-staffing-v039.chef.spec.ts` (NEW)
- `src/lib/auth-context.tsx` (EDIT, L131-152)

## Sprint 2 (NE PAS lancer avant validation Gabin sur HPDN 5905)

- Resize popup
- Greedy priorité
- Refactor Gantt
