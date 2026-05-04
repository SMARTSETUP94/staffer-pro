---
name: Sprint 1 stabilité v0.39.1
description: Audit RLS heures + 3 tests E2E + audit mutations client + auth-context shallow setSession + BUG #6 onboarding loop fix
type: feature
---

# v0.39.1 Sprint 1 — STABILITÉ & CONFIANCE (4 mai 2026)

6 actions livrées. **API Claude (v0.41) reportée au backlog.**

## ✅ Action 1 — Audit RLS heures_saisies (3h)

`heures_saisies_self_select` autorise déjà `employe_id IN (employes WHERE
profile_id = auth.uid())` → **RLS PAS la cause du BUG #33**.
Causes restantes (à traiter v0.39.2 via RPC #2) : `employe_id` mal renseigné
côté `SaisirPourEmployeDialog` ou cache `useMesHeures`.
Matrice : `docs/rls-policies.md`.

## ✅ Action 2 — E2E chef→employé heures (4h)

`e2e/heures/chef-saisit-pour-employe.chef.spec.ts` (4 tests CSPE1–4).

## ✅ Action 3 — E2E auto-staffing v0.39 Vue 1/2/3 (4h)

`e2e/staffing/auto-staffing-v039.chef.spec.ts` (5 tests AS1–5).

## ✅ Action 4 — Audit mutations client (2h)

`docs/audit-mutations-client-v0391.md` : 42 occurrences / 30 fichiers.
Top 5 RPC à migrer :
1. `use-bulk-assign-objet.ts`
2. `SaisirPourEmployeDialog.tsx` (corrige BUG #33 root cause)
3. `BulkSaisieDialog.tsx`
4. `use-feuille-route-tableur.ts`
5. `ParChantierAssignDialog.tsx` + `BulkStafferDialog.tsx`

## ✅ Action 5 — auth-context shallow setSession (30min)

Guard shallow-eq sur `access_token + refresh_token + user.id` avant
`setSession(newSession)`. Évite re-render cyclique sur SIGNED_IN /
INITIAL_SESSION / TOKEN_REFRESHED ré-émis au refocus tab.

## ✅ Action 6 — BUG onboarding loop /dashboard ↔ /onboarding (4h) 🚨 BLOQUANT

**Cause racine identifiée** (Hypothèse 4 du brief = la bonne) :

`auth-context.profileCompleted` est chargé UNE FOIS au login via
`fetchProfileFlags`, puis JAMAIS rechargé. Quand `OnboardingPage.saveStep3(true)`
fait `UPDATE profiles SET profile_completed_at = now()`, l'event Supabase
`USER_UPDATED` n'est PAS émis (UPDATE direct sur table profiles, pas sur
auth.users). Donc `auth-context.profileCompleted` reste à `false` après
le `navigate('/dashboard')`.

Séquence boucle :
1. Wizard `saveStep3(true)` → DB OK
2. `navigate('/dashboard')` → AppGuard rerun
3. `useAuth().profileCompleted === false` (stale) → `shouldRedirectToOnboarding=true`
4. `navigate('/onboarding')`
5. Onboarding `useEffect` fetch fresh profile → `profile_completed_at` SET → `navigate('/dashboard')`
6. Retour étape 2 → boucle infinie (auth-context jamais rechargé)

**Fix livré** :

1. `src/routes/onboarding.tsx` L292 : `await refreshRoles()` AVANT
   `navigate('/dashboard')` après `saveStep3(true)`. Force le reload des
   flags auth-context (`profileCompleted` lit la valeur fraîche).

2. `src/routes/_app.tsx` AppGuard : compteur `onboardingRedirectCountRef`
   (max 3). Au-delà → `markOnboardingSkipped()` + toast d'erreur 10s
   "Boucle de redirection onboarding détectée. Profil libéré". Évite tout
   freeze futur si une autre cause apparaît.

3. `e2e/onboarding/wizard-to-dashboard.smoke.spec.ts` (3 tests OB1–3) :
   - Route `/onboarding` accessible
   - Aucun `window.location.reload` après navigation
   - Max 4 bascules onboarding↔dashboard combinées (anti ping-pong)

**Apparenté à action 5** : le shallow-eq setSession ne suffisait PAS seul,
car le bug venait du flag `profileCompleted` jamais re-fetché — pas du
re-render de session. Les deux fixes sont complémentaires.

## Fichiers livrés

- `docs/rls-policies.md` (NEW)
- `docs/audit-mutations-client-v0391.md` (NEW)
- `e2e/heures/chef-saisit-pour-employe.chef.spec.ts` (NEW)
- `e2e/staffing/auto-staffing-v039.chef.spec.ts` (NEW)
- `e2e/onboarding/wizard-to-dashboard.smoke.spec.ts` (NEW)
- `src/lib/auth-context.tsx` (EDIT — shallow setSession)
- `src/routes/onboarding.tsx` (EDIT — refreshRoles avant navigate)
- `src/routes/_app.tsx` (EDIT — anti-loop counter + toast)

## Sprint 2 (NE PAS lancer avant validation Gabin sur HPDN 5905)

Resize popup, greedy priorité, refactor Gantt.
