
# Hub mobile chef d'équipe — Plan archi (Tour 1 + Tour 2)

## Décisions archi figées (5 points)

**a) Route naming** — Convention existante = `mobile.*` (flat dot routes TanStack → `/mobile/...`) cf. `mobile.aujourdhui.tsx`, `mobile.heures.tsx`, etc. + employé desktop `_app.dashboard-employe.tsx`. **Décision : `/mobile/chef/*`** (pas `/m/chef`) pour rester cohérent avec l'existant. Fichiers : `mobile.chef.tsx` (layout + bottom nav) et `mobile.chef.dashboard.tsx`, `mobile.chef.planning.tsx`, `mobile.chef.staffer.tsx`, `mobile.chef.contrats.tsx`, `mobile.chef.equipe.tsx`, `mobile.chef.fabrication.tsx`.

**b) Réutilisation `/staffer-mobile`** — **Refactor en composant partagé** `<StafferMobileForm />` extrait de `_app.staffer-mobile.tsx`. La route `_app.staffer-mobile.tsx` continue d'exister (admin desktop), et `mobile.chef.staffer.tsx` rend le même composant. Pas de reroute (mauvaise UX dans bottom nav).

**c) Layout bottom nav** — Pattern existant `MobileBottomNav.tsx` (Link TanStack + path matching). **Création d'un `ChefMobileBottomNav.tsx` jumeau** dédié, branché sur `mobile.chef.tsx` (route layout avec `<Outlet/>`). Pas de lib externe. Header = composant `ChefMobileHeader` (cloche notif réutilise `use-notifications`, avatar = `useResolvedEmploye`).

**d) Validation heures mobile** — **Nouvelle page mobile dédiée** `mobile.chef.equipe.tsx` (sous-onglet "Heures à valider" + "Absences"). Le composant desktop `_app.audit-heures.tsx` est trop dense (DataTable). On extrait la logique dans un hook `use-validation-heures-queue.ts` (déjà existe partiellement → `use-validation-count.ts`) et on crée un UI mobile cards + swipe (lib existante : pas de swipe lib → on fait Tap "Valider/Rejeter" boutons larges, MVP, swipe en polish v2).

**e) Statut chef sur objets fab** — **Nouveaux champs dédiés** sur `fabrication_objets` :
- `statut_chef` (enum `objet_fab_statut_chef` : `a_faire | en_cours | bloque | fini`, default `a_faire`)
- `commentaire_chef` (text)
- `statut_chef_updated_at`, `statut_chef_updated_by`
+ nouvelle table `fabrication_objets_photos` (`id, objet_id, storage_path, uploaded_by, uploaded_at, commentaire`).
Bucket Storage `fabrication-photos` (privé, RLS chef/admin + employés assignés via `user_has_affaire_access`).

Le statut existant `fabrication_etapes.statut` reste pour le suivi fin par étape (BE/Num/Bois/etc.). `statut_chef` est une vue **macro chef de chantier** indépendante = pilotage opérationnel terrain.

---

## Tour 1 (~6-8h) — Foundations + Phase A

### Migration SQL
- enum `objet_fab_statut_chef`
- ALTER `fabrication_objets` ADD `statut_chef`, `commentaire_chef`, `statut_chef_updated_*`
- CREATE `fabrication_objets_photos` + RLS
- CREATE bucket `fabrication-photos` + storage policies (chef/admin write, lecture chef/admin + assigned)

### Composants partagés
- `src/components/mobile-chef/ChefMobileBottomNav.tsx` (5 onglets : Dashboard / Planning / Staffer / Équipe / Contrats — avec badge nb sur Équipe = heures en attente, et sur Contrats = nb à signer côté chef)
- `src/components/mobile-chef/ChefMobileHeader.tsx`
- `src/components/staffer/StafferMobileForm.tsx` (refactor extrait de `_app.staffer-mobile.tsx`)

### Routes
- `mobile.chef.tsx` — layout : RoleGuard (admin|chef sinon redirect `/mobile/aujourdhui`), header + `<Outlet/>` + ChefMobileBottomNav, désactive `MobileBottomNav` employé via flag layout
- `mobile.chef.index.tsx` → redirect `/mobile/chef/dashboard`
- `mobile.chef.dashboard.tsx` — KPI cards (mes chantiers actifs aujourd'hui, équipe présents/absents, heures à valider, contrats en attente) + liste "Aujourd'hui" compacte
- `mobile.chef.planning.tsx` — semaine compacte (Lun→Dim) qui-fait-quoi équipe, swipe sem-1 / sem+1 (boutons + flèches, swipe natif via `touchstart/end` simple)
- `mobile.chef.staffer.tsx` — wrapper `<StafferMobileForm />`
- `mobile.chef.contrats.tsx` — liste contrats déclenchés par chef (filter `created_by = current user`), grouping par statut, bouton "Relancer" → `sms:` / `mailto:` / `https://wa.me/` selon dispo téléphone employé

### Hooks
- `use-chef-dashboard.ts` (queries Supabase parallèles → KPIs + liste jour)
- `use-chef-planning-semaine.ts`
- `use-mes-contrats-declenches.ts`

### Tests Tour 1
- E2E smoke `chef-mobile-hub-nav.chef.spec.ts` : login chef mobile → /mobile/chef → 5 onglets cliquables → assertions URL + 1 KPI visible

---

## Tour 2 (~6-8h) — Phase B + Fabrication

### Onglet Mon équipe
- `mobile.chef.equipe.tsx` — Tabs sub-nav `Heures (n)` / `Absences (n)`
- `mobile.chef.equipe.heures.tsx` (ou state local) — queue cards heures statut `soumis` employés du chef, boutons Valider / Rejeter (motif modal) / Voir détail
- `mobile.chef.equipe.absences.tsx` — demandes `valide=false`, boutons Valider/Refuser
- Hook `use-equipe-validation-queue.ts` factorise comptes + items

### Onglet Fabrication (accessible depuis Dashboard quick-action + lien Planning)
- `mobile.chef.fabrication.tsx` — liste objets fab où chef est respo (chantier `chef_chantier_id = me` OU `respo_fab_id = me` ou métiers équipe)
- Carte objet : nom, ref, chantier, badge `statut_chef`, bouton large 4 statuts (segmented), input commentaire bref, bouton appareil photo (input file capture=environment) → upload Supabase Storage → ligne dans `fabrication_objets_photos`
- RPC server-fn `update_objet_statut_chef(objet_id, statut, commentaire)` avec audit trigger optionnel (out of scope MVP, simple UPDATE)

### Tests E2E Tour 2
- `chef-mobile-validation-heures.chef.spec.ts` : valider une heure équipe en attente → assertion statut bascule
- `chef-mobile-fabrication-photo.chef.spec.ts` : marquer objet `fini` + upload photo (mock blob) → assertion ligne photos + statut

---

## Hors scope (figé en fin de Tour 2)
- Swipe gestures natifs (pour MVP : boutons larges)
- WhatsApp Business API (juste deeplink `wa.me`)
- Notifications push (cloche = lecture in-app uniquement)
- Workflow signature contrats côté chef (intentionnel : chef ≠ signataire)

---

## Fichiers (estimation)
**Tour 1** : 1 migration SQL, 6 routes, 3 composants partagés, 3 hooks, 1 test E2E (~14 fichiers)
**Tour 2** : 1 migration (si trigger audit), 3 routes, 4 composants (cards heures, modal motif, card objet fab, upload photo), 2 hooks, 1 server-fn, 2 tests E2E (~13 fichiers)
