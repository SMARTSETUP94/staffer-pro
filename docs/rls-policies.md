# Matrice RLS — acteur × action × table

> v0.39.1 Sprint 1 (4 mai 2026). Source de vérité : `pg_policy` introspecté sur
> la base preview/staging. Mise à jour : à chaque migration touchant les
> policies. Voir `mem://constraints/rls-helpers-execute-grant` pour les 7
> helpers `SECURITY DEFINER` à NE JAMAIS révoquer.

## Helpers utilisés dans les policies

| Fonction                          | Rôle                                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| `is_admin()`                      | `auth.uid()` a le rôle `admin`                                       |
| `is_chef_or_admin()`              | `auth.uid()` a le rôle `chef_chantier` ou `admin`                    |
| `has_role(uuid, app_role)`        | Check générique rôle                                                 |
| `user_has_affaire_access(uuid)`   | Employé assigné à l'affaire (via `assignations` ou `staffing_plan`)  |
| `user_is_mentioned_on_affaire(uuid)` | Employé mentionné dans `affaire_commentaires.mentions[]`           |
| `is_devis_termine(uuid)`          | Le devis est verrouillé (`statut = 'termine'`)                       |
| `can_saisie_on_affaire(uuid, date)` | Combinaison accès + fenêtre temporelle valide                      |

## Table `heures_saisies` (CRITIQUE — BUG #33)

| Action | Policy                            | Acteurs autorisés                                                                                                          |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| SELECT | `heures_saisies_self_select`      | `is_chef_or_admin()` **OU** `employe_id` matche `auth.uid()` via `employes.profile_id` **OU** `user_has_affaire_access()`  |
| INSERT | `heures_saisies_self_insert`      | `is_admin()` **OU** (`is_chef_or_admin()` ou propriétaire) ET `can_saisie_on_affaire(affaire_id, date)`                    |
| UPDATE | `heures_saisies_self_update`      | `is_admin()` **OU** `is_chef_or_admin()` (sauf devis terminé) **OU** propriétaire (statut ∈ brouillon/soumis, devis non terminé) |
| DELETE | `heures_saisies_admin_chef_delete`| `is_admin()` **OU** (`is_chef_or_admin()` ET devis non terminé)                                                            |

### ✅ Verdict audit BUG #33

La policy `heures_saisies_self_select` **autorise déjà l'employé** à voir ses
heures, peu importe qui les a insérées (chef ou lui-même), tant que
`heures_saisies.employe_id` pointe vers son propre `employes.id`. La RLS
n'est donc **PAS la cause du bug** — la cause est ailleurs (cf. § "Pistes
restantes" plus bas).

### Pistes restantes pour BUG #33 (hors RLS)

1. **`employe_id` mal renseigné côté RPC** : vérifier `SaisirPourEmployeDialog.tsx`
   et la fonction RPC chef → s'assurer que `employe_id` = celui de l'employé,
   pas celui du chef.
2. **Cache `useMesHeures`** : la query filtre `.eq("employe_id", employeId)`
   où `employeId` provient de `useResolvedEmploye()` côté employé. Vérifier
   qu'il n'y a pas de race condition entre login et premier fetch.
3. **`staffing_plan_id` ou `assignation_id` manquant** : si une saisie chef
   est créée sans rattachement, vérifier qu'elle apparaît bien dans le filtre
   semaine (date entre `startStr` et `endStr`).
4. **Mobile** : vérifier que `/mobile/heures` et `/mobile/aujourdhui` lisent
   bien la même table sans filtre supplémentaire.

Test E2E couvrant : `e2e/heures/chef-saisit-pour-employe.chef.spec.ts`.

## Table `assignations`

| Action | Policy                            | Acteurs autorisés                                                                  |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------- |
| SELECT | `assignations_select_self_or_chef`| `is_chef_or_admin()` **OU** propriétaire **OU** `user_has_affaire_access()`        |
| INSERT | `assignations_insert_chef_admin`  | `is_chef_or_admin()` ET (devis null OU non terminé OU admin)                       |
| UPDATE | `assignations_update_chef_admin` + `assignations_self_confirm` | Chef/admin (devis non terminé) OU employé (confirmation only)  |
| DELETE | `assignations_delete_chef_admin`  | `is_chef_or_admin()` ET (devis null OU non terminé OU admin)                       |

## Table `affaires`

| Action | Policy                             | Acteurs autorisés                                                                |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------- |
| SELECT | `affaires_select_chef_admin_or_assigned` | Chef/admin **OU** `user_has_affaire_access()` **OU** `user_is_mentioned_on_affaire()` |
| ALL    | `affaires_admin_chef_modify`       | Chef/admin uniquement                                                            |

## Table `staffing_plan` + `staffing_plan_step` + `staffing_plan_assignment`

| Table                       | SELECT                                                              | INSERT/UPDATE      | DELETE     |
| --------------------------- | ------------------------------------------------------------------- | ------------------ | ---------- |
| `staffing_plan`             | Chef/admin OU `user_has_affaire_access()`                           | Chef/admin         | Admin only |
| `staffing_plan_step`        | Via `staffing_plan` (chef OU accès affaire)                         | Chef/admin         | Chef/admin |
| `staffing_plan_assignment`  | Chef/admin OU propriétaire OU accès affaire via plan→step           | Chef/admin         | Chef/admin |
| `staffing_plan_object`      | Via `staffing_plan` (chef OU accès affaire)                         | Chef/admin         | Chef/admin |
| `staffing_plan_snapshot`    | Chef/admin                                                          | Chef/admin (insert) | —          |

## Tables transverses

- **`absences`** : SELECT propriétaire/chef ; INSERT propriétaire (`valide=false`) ou chef ; UPDATE/DELETE chef/admin.
- **`fabrication_objets` / `fabrication_etapes`** : SELECT public authentifié ; modify chef/admin.
- **`devis` / `devis_postes` / `devis_imports`** : full chef/admin.
- **`employes` / `profiles`** : SELECT self ou chef ; modify chef/admin (employes), admin (profiles).
- **`notifications`** : SELECT/UPDATE/DELETE self uniquement (pas d'INSERT côté client — passe par triggers).
- **`feedbacks`** : SELECT self ou admin ; INSERT chef/admin (auteur = self) ; UPDATE/DELETE admin.

## Règle d'or

**Toute nouvelle policy DOIT** :

1. Utiliser un helper `SECURITY DEFINER` plutôt qu'un `SELECT` inline → évite la récursion RLS.
2. Avoir une contrepartie `WITH CHECK` pour INSERT/UPDATE.
3. Être documentée dans cette matrice **dans la même PR** que la migration.
4. Passer le linter `supabase--linter` sans warning RLS.

## Anti-patterns évités (v0.39.2b)

> Si vous croisez l'un de ces patterns lors d'un dev, **STOP**, lisez cette
> doc, demandez confirmation avant de pousser.

1. **Filtre `.eq("user_id", auth.uid())` dans une RPC sans gérer le cas chef/admin**
   → casse les écrans "saisir pour un employé". Toujours résoudre l'`employe_id`
   cible côté serveur via le helper `resolveEmployeId({ asUser })`.
2. **Policy `USING (true)` "temporaire"** → jamais. Préférez ajouter une
   nouvelle policy nommée explicitement (`*_admin_override`) avec
   `is_admin()` au minimum.
3. **`SECURITY DEFINER` sans `SET search_path = public`** → injection possible
   via `search_path` utilisateur. Tous nos helpers le déclarent.
4. **`REVOKE EXECUTE` sur les 7 helpers RLS** → casse toutes les policies qui
   les invoquent. Voir `mem://constraints/rls-helpers-execute-grant`.
5. **CHECK constraint `expire_at > now()`** → CHECK doit être immutable. Utiliser
   un trigger BEFORE INSERT/UPDATE pour les validations temporelles.
6. **Insertion côté client dans `notifications`** → passer par un trigger
   (la table n'a pas de policy INSERT côté client).
7. **`employe_id` égal au `profile_id` du chef au lieu de l'employé cible** dans
   les saisies `heures_saisies` (BUG #33). Toujours utiliser le helper côté serveur.

## Matrice acteur × action × table (v0.39.2b)

Légende : `✅` autorisé direct · `🔒` autorisé sous condition (cf. policy) · `❌` refusé.

| Table                          | admin SELECT | admin WRITE | chef SELECT | chef WRITE | employé SELECT | employé WRITE | intérim SELECT | intérim WRITE |
| ------------------------------ | :----------: | :---------: | :---------: | :--------: | :------------: | :-----------: | :------------: | :-----------: |
| `heures_saisies`               | ✅           | ✅          | ✅          | 🔒 devis   | 🔒 self+access | 🔒 self draft | 🔒 self+access | 🔒 self draft |
| `assignations`                 | ✅           | ✅          | ✅          | 🔒 devis   | 🔒 self+access | 🔒 confirm    | 🔒 self+access | 🔒 confirm    |
| `affaires`                     | ✅           | ✅          | ✅          | ✅         | 🔒 access      | ❌            | 🔒 access      | ❌            |
| `staffing_plan*`               | ✅           | ✅          | ✅          | ✅         | 🔒 access      | ❌            | 🔒 access      | ❌            |
| `fabrication_objets`           | ✅           | ✅          | ✅          | ✅         | ✅             | ❌            | ✅             | ❌            |
| `devis*`                       | ✅           | ✅          | ✅          | ✅         | ❌             | ❌            | ❌             | ❌            |
| `profiles`                     | ✅           | ✅          | 🔒 self+chef| 🔒 self    | 🔒 self        | 🔒 self       | 🔒 self        | 🔒 self       |
| `employes`                     | ✅           | ✅          | ✅          | ✅         | 🔒 self        | ❌            | 🔒 self        | ❌            |
| `absences`                     | ✅           | ✅          | ✅          | ✅         | 🔒 self        | 🔒 self draft | 🔒 self        | 🔒 self draft |
| `notifications`                | ✅           | trigger     | 🔒 self     | trigger    | 🔒 self        | trigger       | 🔒 self        | trigger       |

> **Lecture obligatoire** avant tout dev qui touche `heures_saisies`,
> `assignations`, `staffing_plan*` ou `affaires`. Mention explicite ajoutée
> à `CONTRIBUTING.md` (sprint v0.39.2b).


## v0.21.1 — Durcissement édition employé (`heures_saisies`)

### `heures_saisies_self_update`

| Acteur                       | brouillon | soumis | rejete | valide |
| ---------------------------- | :-------: | :----: | :----: | :----: |
| admin                        | ✅        | ✅     | ✅     | ✅     |
| chef_chantier (devis ouvert) | ✅        | ✅     | ✅     | ✅     |
| chef_chantier (devis terminé)| ❌        | ❌     | ❌     | ❌     |
| employé propriétaire         | ✅        | ✅     | ✅     | **❌** |
| autre employé                | ❌        | ❌     | ❌     | ❌     |

> **Changement v0.21.1** : un employé propriétaire ne peut plus éditer
> une saisie validée par le chef (auparavant : limité à brouillon/soumis,
> donc le rejet bloquait aussi). La nouvelle règle (`statut <> 'valide'`)
> autorise la correction post-rejet sans rouvrir la validation.

### `heures_saisies_self_delete_brouillon` (nouvelle policy)

L'employé propriétaire peut supprimer ses saisies **uniquement en
statut `brouillon`** et tant que le devis n'est pas terminé. Au-delà,
seuls chef ou admin peuvent supprimer (policy `heures_saisies_admin_chef_delete`).

## v0.21.1 — Unicité chef du jour (`assignations`)

`UNIQUE INDEX assignations_chef_jour_unique (affaire_id, date, demi_journee) WHERE est_chef_jour = true`

Renforce atomiquement le trigger `enforce_unique_chef_jour` : en cas de
désignations concurrentes par deux admins, la seconde transaction est
rejetée par contrainte (au lieu d'écraser silencieusement la première
puis de laisser une fenêtre de course). Le trigger reste en place pour
la rétro-compatibilité côté UI (downgrade automatique du précédent chef).

## Matrice tests automatisés (Phase 4 — partiellement livrée)

| Cellule matrice                       | Test automatisé                                    |
| ------------------------------------- | -------------------------------------------------- |
| RoleGuard admin / chef / employé      | `src/components/auth/__tests__/RoleGuard.test.ts`  |
| heures_saisies UPDATE/DELETE x statut | `src/lib/__tests__/rls-heures-saisies.test.ts`     |
| chef_du_jour unicité concurrent       | `src/lib/__tests__/chef-du-jour-unique.test.ts`    |
| anti-fuite RGPD employé desktop       | `e2e/employe-desktop/anti-fuite-rgpd.employe-desktop.spec.ts` |

Tests d'intégration SQL contre la DB live (avec `service_role` vs `anon`)
reportés à un sprint dédié (setup CI requis : pool dédié, snapshot/restore
avant chaque run). Les tests de logique purs ci-dessus suffisent pour
détecter les régressions applicatives qui dupliquent les règles RLS.
