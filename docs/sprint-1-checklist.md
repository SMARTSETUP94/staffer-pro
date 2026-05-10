# Sprint 1 — Hub Chef Mobile (v0.43.0 + v0.43.1)

> Livré le 10 mai 2026. Releases : `v0.43.0` (modules core), `v0.43.1` (durcissement
> + tests E2E + checklist). Sprint estimé 30-35h, **réel ≈ 32h**.

---

## 1. Composants livrés

### Routes mobile chef
| Route | Rôle | Composant |
|---|---|---|
| `/mobile/chef` | Layout (Outlet + bottom nav) | `mobile.chef.tsx` |
| `/mobile/chef/dashboard` | KPI + alertes critiques + affaires (multi-rôles) | `mobile.chef.dashboard.tsx` |
| `/mobile/chef/planning` | Planning hebdo scopé + filtres affaire/métier | `mobile.chef.planning.tsx` |
| `/mobile/chef/equipe` | Tabs : Staffer / Saisir / Valider | `mobile.chef.equipe.tsx` |
| `/mobile/chef/a-valider` | Validation heures + objets fab + audit trail | `mobile.chef.a-valider.tsx` |
| `/mobile/chef/moi` | Heures perso + profil + contrats | `mobile.chef.moi.tsx` |
| `/mobile/chef/staffer` | Form staffing rapide (scope chef DUR) | `mobile.chef.staffer.tsx` |
| `/mobile/chef/contrats` | Contrats CDDU déclenchés par le chef | `mobile.chef.contrats.tsx` |
| `/mobile/chef/fabrication` | Étapes fab par chantier | `mobile.chef.fabrication.tsx` |

### Composants UI
- `ChefMobileBottomNav.tsx` — bottom nav 5 onglets avec badge "à valider" auto.
- `ChefMobileHeader.tsx` — header sticky avec titre + retour.
- `RolesAffaireBadges.tsx` — badges colorés multi-rôles (chef projet, chef chantier, montage, démontage, charge d'affaires).
- `StafferMobileForm.tsx` — durci en v0.43.1 avec prop `scopeToChef` (filtre chantiers + équipe par périmètre + métier_principal).

### Hooks data layer
- `use-mes-affaires-chef.ts` — RPC `mes_affaires_chef` + variant `useMesAffairesChefIds()`.
- `use-chef-a-valider.ts` — agrégation heures+objets pending sur périmètre chef.
- `use-chef-badge-counts.ts` — compteur live pour bottom nav.

---

## 2. DB (migration `20260510175111`)

### Vues
- `v_chefs_par_affaire` — agrège `chef_projet_id`, `chef_chantier_id`, `responsable_montage_id`, `responsable_demontage_id`, `charge_affaires_id`, `respo_fab_id` (depuis `fabrication_objets`) en lignes `(affaire_id, employe_id, role)`.

### Tables
- `heures_validations (id, heure_saisie_id, valide_par_chef_id, valide_at, action, valeur_avant, valeur_apres, role_au_moment, commentaire)` — audit trail validations chef.
  - RLS : INSERT chef-on-affaire only, SELECT admin/chef/self.

### RPC (SECURITY DEFINER)
- `is_chef_on_affaire(_employe_id, _affaire_id)` — boolean générique.
- `current_user_is_chef_on_affaire(_affaire_id)` — boolean pour `auth.uid()`.
- `mes_affaires_chef(_employe_id)` → `setof (affaire_id uuid, mes_roles text[])`.

### Triggers
- `t_audit_validation_heures` sur `heures_saisies` UPDATE → snapshot before/after dans `heures_validations` quand `statut` passe à `valide` ou `refuse`.

---

## 3. RLS

| Table | État v0.43.1 | Cible v0.44 |
|---|---|---|
| `heures_validations` | INSERT scoped via `current_user_is_chef_on_affaire` | ✅ |
| `heures_saisies` | `is_chef_or_admin()` (global) | ⏳ chef-scoped per affaire |
| `fabrication_objets` | `is_chef_or_admin()` (global) | ⏳ chef-scoped per affaire |
| `contrats_intermittents` | `is_admin()` modify, self SELECT | ⏳ chef-scoped read |

**Décision v0.43.1** : on conserve le modèle global `chef_chantier = CRUD sauf paramétrage`. Le scope par affaire est appliqué CÔTÉ APP via `mes_affaires_chef` (hooks + StafferMobileForm). Migration RLS dure prévue pour **v0.44** avec audit `/validation-heures`, `/audit-heures`, planning desktop.

---

## 4. Tests

### E2E Playwright (`e2e/mobile-chef/`)
- `hub-nav.chef.spec.ts` — navigation 5 onglets (v0.43.0).
- `sprint1-7scenarios.chef.spec.ts` — **7 scénarios obligatoires brief (v0.43.1)** :
  1. Hub /mobile/chef → 5 onglets
  2. Saisie heures perso via Moi
  3. Saisie heures équipe via Mon équipe
  4. Validation heures → audit trail
  5. Validation objet fabrication
  6. Staffing équipe sur chantier
  7. URL forgée → pas de leak RLS

### Pré-requis seed CI
Compte `E2E_CHEF_EMAIL` doit avoir au moins 1 affaire active où il est `chef_chantier_id` (déjà seedé via `e2e/seed.ts`).

---

## 5. TODO restants (post-v0.43.1)

- [ ] **v0.44 audit RLS** : décision migration `chef_metier` ou conservation global.
- [ ] Refacto `StafferMobileForm` : reset `chantierId` si l'affaire sort du scope (edge case si chef perd l'affaire).
- [ ] `pgTAP` integration tests (tâche v0.44 dédiée).
- [ ] **Sprint 2** : module documents/photos par affaire — voir plan Sprint 2.

---

## 6. Stats

- Lignes ajoutées : ≈ 2 800 (hooks + routes + composants + tests + migration).
- Migrations DB : 1 (`20260510175111`).
- Tests E2E ajoutés : 8 cas (1 nav + 7 scénarios).
- Effort réel : ≈ 32h (estimé 30-35h ✅).
