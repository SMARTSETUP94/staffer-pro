# Plan — Corrections P0/P1 matrice rôles × typologies + objets par métier

Suite aux deux audits (rôles × typologies, puis routes compétences/objets), voici le plan d'exécution priorisé. Je propose de découper en **3 lots livrables séparément** pour limiter le risque de régression.

## Lot 1 — P0 Sécurité données fab (critique)

**Objectif** : stopper la fuite RGPD sur `fabrication_objets` et aligner le scope `metier`.

1. **RLS `fabrication_objets.SELECT`** — remplacer `USING (true)` par une policy scope-aware :
   - admin / chef_chantier → tout
   - bureau_etude / commercial / logistique → tout (lecture seule métier)
   - atelier_chef → objets de son métier (`heures_prevues_<metier> > 0` sur le métier principal)
   - atelier_metier → objets de son métier + équipe (`fabrication_objet_equipe`)
   - employe / poseur / rh → uniquement si membre `fabrication_objet_equipe` OU `user_has_affaire_access(affaire_id)`
2. **RLS idem** sur `fabrication_etapes.SELECT` et `fabrication_etapes_historique.SELECT` (mêmes `USING (true)`).
3. **`useFabricationDashboard`** (`src/hooks/use-fabrication-dashboard.ts`) — appliquer le scope `metier` de `section.planning_fab` : filtrer côté serveur selon le métier principal de l'utilisateur.
4. **RLS `affaire_equipe_modify_chef_admin`** — étendre à `atelier_chef` pour son métier (permet `objet_equipe.manage`(metier) qui est aujourd'hui bloqué côté DB malgré la cap accordée).

## Lot 2 — P1 Guards routes + caps manquantes

**Objectif** : combler les trous de garde route et caps employé/poseur.

5. **Cap `mobile.mes_missions`** — grant explicite à `employe` + `poseur` (route `/missions/$affaireId/$phase` actuellement ambiguë).
6. **Cap `section.ma_semaine`** — grant à `employe` + `poseur` (items sidebar "Mes missions pose").
7. **`requireCapability()` dans `beforeLoad`** sur :
   - `/mes-missions` → `mes_missions.view`
   - `/mes-heures` → `mes_heures.view`
   - `/planning` → `section.planning_pose`
   - `/affaires/$id/fabrication` → `section.fabrication` (au lieu de `section.affaires`, ce qui débloquera `atelier_chef` et `atelier_metier` et fermera l'accès `rh`)
8. **`/fabrication/mes-etapes` → fiche objet directe** (`/affaires/$id/fabrication?objet=<id>`) au lieu de `/affaires/$id/fabrication` pleine page → résout la navigation morte de l'`atelier_metier` (peintre).

## Lot 3 — P2 Affinements scope

**Objectif** : aligner les comportements RLS sur la sémantique métier.

9. **RLS `assignations.SELECT`** — ajouter cas `commercial` pour voir le casting fab de ses 5XXX (`charge_affaires_id = auth.uid()` quand `typologie = fabrication`).
10. **RLS `affaire_equipe`** — restreindre `logistique` aux affaires dont il est `charge_affaires_id` OU `chef_chantier_id` pour les mutations phase `logistique`.
11. **Matrice fiche objet** (`src/lib/objet-fiche-permissions.ts`) — ajouter `atelier_metier` avec `["commentaire"]` (lecture+commentaire, pas plus).
12. **Suppression heures par `rh`** — étendre policy `heures_saisies_admin_chef_delete` à `rh` (cohérent avec son rôle de validation).

## Hors-scope (à traiter dans sprints dédiés)

- Route `/mobile/fabrication` (debt L4 connue, mem://debts/mobile-fabrication-a-livrer-en-L4).
- Refonte UX 5XXX pour machiniste/poseur (pas de parcours fab côté terrain → sprint dédié).
- Bypass curl+JWT `bureau_etude` sur `fabrication_objets` WRITE → couvert par Lot 1 (la nouvelle RLS empêche l'INSERT/UPDATE hors métier).

## Détails techniques

- **Tous les changements RLS** = migration SQL unique par lot (atomique).
- **Tests E2E à mettre à jour** : `e2e/capabilities/fiche-objet.*.spec.ts` + `e2e/sidebar/sidebar-capability.atelier-metier.spec.ts` + nouveau spec `e2e/capabilities/fab-rls-scope.spec.ts` pour vérifier qu'un peintre ne voit que ses objets.
- **Pas de breaking change UI** : les changements RLS sont restrictifs côté `employe/poseur/atelier_metier`, mais ces rôles ne consommaient pas la fuite (donc 0 régression visible). Le scope `useFabricationDashboard` filtrera des objets aujourd'hui visibles à tort → c'est l'effet recherché.
- **Rollback** : chaque lot a sa migration séparée, rollback ligne par ligne possible.

## Ordre proposé

1. **Lot 1 maintenant** (P0 critique — fuite RGPD).
2. **Lot 2 ensuite** après validation Lot 1 (guards routes).
3. **Lot 3 en finition** (affinements).

Je te confirme avant chaque lot. On démarre Lot 1 ?
