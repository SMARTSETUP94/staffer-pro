
# Sprint 1 — Hub Chef Mobile (`/m/chef`)

Basé sur le diagnostic schéma : pas de table chefs, uniquement 5 colonnes UUID sur `affaires` + `respo_fab_id` sur `fabrication_objets`. Toutes les décisions D1→D6 intégrées.

## Phase 0 — DB foundations (migration unique, à valider avant Phase 1)

### 0.1 Vue `v_chefs_par_affaire`

```sql
CREATE OR REPLACE VIEW public.v_chefs_par_affaire AS
SELECT id AS affaire_id, chef_projet_id        AS employe_id, 'chef_projet'      AS role FROM affaires WHERE chef_projet_id        IS NOT NULL
UNION ALL
SELECT id, chef_chantier_id,         'chef_chantier'         FROM affaires WHERE chef_chantier_id         IS NOT NULL
UNION ALL
SELECT id, responsable_montage_id,   'responsable_montage'   FROM affaires WHERE responsable_montage_id   IS NOT NULL
UNION ALL
SELECT id, responsable_demontage_id, 'responsable_demontage' FROM affaires WHERE responsable_demontage_id IS NOT NULL
UNION ALL
SELECT id, charge_affaires_id,       'charge_affaires'       FROM affaires WHERE charge_affaires_id       IS NOT NULL
UNION ALL
SELECT affaire_id, respo_fab_id,     'respo_fab'             FROM fabrication_objets WHERE respo_fab_id  IS NOT NULL
ORDER BY affaire_id, role;
```
Vue `security_invoker = on` pour respecter les RLS de `affaires`.

### 0.2 RPC `is_chef_on_affaire`

```sql
CREATE OR REPLACE FUNCTION public.is_chef_on_affaire(_employe_id uuid, _affaire_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM v_chefs_par_affaire
    WHERE affaire_id = _affaire_id AND employe_id = _employe_id
  )
$$;
```

Helper compagnon pour RLS (auth.uid → employe.profile_id) :
```sql
CREATE OR REPLACE FUNCTION public.current_user_is_chef_on_affaire(_affaire_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM v_chefs_par_affaire v
    JOIN employes e ON e.id = v.employe_id
    WHERE v.affaire_id = _affaire_id AND e.profile_id = auth.uid()
  )
$$;
```

### 0.3 RPC `mes_affaires_chef`

```sql
CREATE OR REPLACE FUNCTION public.mes_affaires_chef(_employe_id uuid)
RETURNS TABLE(LIKE affaires, mes_roles text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT a.*, ARRAY_AGG(v.role ORDER BY v.role) AS mes_roles
  FROM affaires a
  JOIN v_chefs_par_affaire v ON v.affaire_id = a.id
  WHERE v.employe_id = _employe_id
  GROUP BY a.id
  ORDER BY a.date_debut DESC NULLS LAST;
$$;
```

### 0.4 Table audit `heures_validations`

```sql
CREATE TABLE public.heures_validations (
  id uuid PK default gen_random_uuid(),
  heure_saisie_id uuid NOT NULL REFERENCES heures_saisies(id) ON DELETE CASCADE,
  valide_par_chef_id uuid NOT NULL REFERENCES employes(id),
  valide_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL CHECK (action IN ('validate','correct','reject')),
  valeur_avant numeric,
  valeur_apres numeric NOT NULL,
  commentaire text,
  role_au_moment text NOT NULL  -- snapshot, ex 'chef_chantier'
);
CREATE INDEX ON heures_validations(heure_saisie_id);
CREATE INDEX ON heures_validations(valide_par_chef_id, valide_at DESC);
```
RLS : INSERT par chef sur ses affaires uniquement (via jointure `heures_saisies.affaire_id`), SELECT chef + admin + employé concerné.

### 0.5 RLS additionnelles « scope chef »

Ajouter (en complément, sans casser l'existant qui donne déjà tout au rôle système `chef_chantier`) — politique additive permissive ciblée pour les futurs rôles plus restreints, ET sur `fabrication_objets` photo upload :

| Table | Nouvelle policy SELECT/UPDATE | Condition |
|---|---|---|
| `heures_saisies` | (déjà OK via `user_has_affaire_access`) | rien à ajouter |
| `fabrication_objets` | UPDATE chef → seulement champs `statut_chef`, `commentaire_chef`, `statut_chef_updated_*` | trigger column-guard |
| `heures_validations` | INSERT WITH CHECK | `current_user_is_chef_on_affaire((SELECT affaire_id FROM heures_saisies WHERE id = heure_saisie_id))` |
| `fabrication_objets_photos` | INSERT chef | `current_user_is_chef_on_affaire(fo.affaire_id)` (déjà via `is_chef_or_admin` global, on conserve) |

⚠️ **Choix conscient** : on **ne durcit pas** le rôle système `chef_chantier` global dans ce sprint (cela casserait l'app desktop existante). Le scoping par affaire vaut pour les **nouvelles** opérations (audit `heures_validations`, photos preuve) et l'UI mobile filtre côté query. Durcissement RLS chef-scope-par-affaire = **sprint séparé** (à inscrire roadmap v0.43).

### 0.6 Trigger `t_audit_validation_heures`

À chaque `UPDATE` de `heures_saisies` qui passe `statut` brouillon→valide ou modifie `heures_reelles` par un user dont l'employé est chef sur l'affaire, INSERT auto dans `heures_validations` avec snapshot `before/after`. Si UPDATE par admin → `role_au_moment='admin'`.

---

## Phase 1 — Server functions (`src/lib/chef.functions.ts`)

Toutes protégées par `requireSupabaseAuth` :
- `getMesAffairesChef()` → wrap `mes_affaires_chef(auth.employe_id)`
- `getDashboardChef()` → KPI agrégés (heures à valider, objets à valider, taille équipe semaine, alertes)
- `getPlanningChef({ semaine })` → assignations + objets sur affaires du chef
- `getEquipeChef({ affaire_id?, metier_id? })` → employés staffés sur ses affaires
- `getHeuresAValider({ affaire_id?, employe_id? })` → `heures_saisies` statut `soumis`/`brouillon` sur ses affaires
- `getObjetsAValider()` → `fabrication_objets` où respo_fab=me ET statut_chef≠'fini'
- `validerHeure({ heure_saisie_id, action, valeur_apres, commentaire })` → UPDATE + INSERT validation
- `validerObjet({ objet_id, statut_chef, commentaire, photo_path? })` → UPDATE statut + photo storage
- `saisirHeureEquipe({ employe_id, affaire_id, date, heures, ... })` → check `is_chef_on_affaire` puis INSERT pour le compte de l'employé (`saisi_par_chef=true`)

Toutes vérifient `current_user_is_chef_on_affaire(affaire_id)` côté handler avant écriture.

---

## Phase 2 — UI mobile (route shell + 5 onglets)

### Arborescence routes

```
src/routes/_authenticated/m/chef.tsx                 # layout + bottom nav 5
src/routes/_authenticated/m/chef.index.tsx           # → redirect dashboard
src/routes/_authenticated/m/chef.dashboard.tsx       # Onglet 1
src/routes/_authenticated/m/chef.planning.tsx        # Onglet 2
src/routes/_authenticated/m/chef.equipe.tsx          # Onglet 3 (tabs internes a/b/c)
src/routes/_authenticated/m/chef.a-valider.tsx       # Onglet 4 (sections heures/objets)
src/routes/_authenticated/m/chef.moi.tsx             # Onglet 5
```

`beforeLoad` du layout : `if (!estChefSurAuMoinsUneAffaire) redirect('/m/employe')`.

### Composants nouveaux

```
src/components/mobile/chef/
  ChefBottomNav.tsx               # 5 icons + badge counts
  ChefDashboardKPI.tsx
  ChefAffaireCard.tsx             # multi-badges roles
  ChefPlanningWeek.tsx            # lecture seule
  ChefEquipeTabs.tsx              # 3 tabs : Staffer / Saisir / Valider
  ChefSaisirHeuresEquipeForm.tsx  # batch journée
  ChefValiderHeuresList.tsx       # swipe approve/correct
  ChefValiderObjetCard.tsx        # photo upload optionnelle
  ChefMoiHub.tsx                  # ré-utilise composants /m/employe
```

Réutilisation directe (pas de fork) : `StafferMobileForm` (avec props `restrictAffaireIds` + `restrictEquipeMetierIds`), `MesHeuresMobile`, `MonProfilMobile`, `MesContratsMobile`.

### Bottom nav badges

- Onglet 4 : count `getHeuresAValider().length + getObjetsAValider().length`
- Auto-refresh via `useQuery` polling 60s.

---

## Phase 3 — Storage photos preuve validation objet

- Bucket existant `fabrication-objets-photos` réutilisé.
- Path : `{affaire_id}/{objet_id}/validation-{timestamp}.jpg`
- `commentaire` photo = "Validation chef + {role_au_moment}" préfixé auto.

---

## Phase 4 — Tests E2E (`tests/e2e/m-chef-*.spec.ts`)

7 specs Playwright correspondant exactement aux 7 cas exigés (login chef, heures perso, heures équipe, validation heures + audit row, validation objet, staffing, blocage 403 sur affaire non-assignée).

---

## Estimé d'effort réel

| Phase | Tâche | h |
|---|---|---|
| 0 | Migration vue + 2 RPC + helper RLS + table audit + trigger + tests SQL | **5** |
| 1 | 9 server functions + types + handlers de scope | **6** |
| 2 | Layout + bottom nav + 5 routes squelettes + redirect guard | **3** |
| 2 | Onglet Dashboard (KPI cards + alertes) | **3** |
| 2 | Onglet Planning (lecture seule + filtres) | **4** |
| 2 | Onglet Équipe (3 tabs : staffer / saisir / valider swipe) | **6** |
| 2 | Onglet À valider (heures + objets + photo) | **4** |
| 2 | Onglet Moi (réutilisation pure) | **1** |
| 3 | Photos preuve (upload + commentaire) | **1** |
| 4 | 7 specs E2E Playwright | **4** |
| QA | QA mobile manuelle 1015×768 + 390×844 + ajustements | **2** |
| **Total** | | **39h** (tampon ±10% : 35-43h) |

Légèrement au-dessus de ton estimé 30-35h à cause du trigger d'audit + des 7 specs E2E exhaustives. Si on déscope les specs E2E à 3 critiques (login/audit/403), on retombe à **34h**.

---

## Hors scope explicitement (renvoyés Sprint 2+)

- Module documents/photos par affaire (Sprint 2 dédié, comme convenu)
- Durcissement RLS « chef ne voit que ses affaires » au niveau rôle système → **v0.43**
- Granularité « chef peintre / chef bois » au niveau affaire (table `affaire_chefs_metier`) → **v0.43+**, on filtre par `employes.metier_principal_id` côté query en attendant
- Notifications push pour alertes chef → backlog

---

## Pré-requis avant code

1. ✅ Ton GO sur le plan
2. Compte chef de test créé par Gabin (avec au moins 2 affaires dont au moins 1 multi-rôles)
3. Décision : on commit avec ou sans les 7 specs E2E (impact 4h)
