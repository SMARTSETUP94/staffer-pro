# v0.44.1 — Refonte UX Hub Chef Mobile

Plan d'archi à valider AVANT migration DB et code.

---

## 1. Fix doublon validation heures

**État actuel** :
- `/mobile/chef/equipe` (sous-tabs : Staffer + Saisir)
- `/mobile/chef/a-valider` (sous-tabs : Heures + Objets)
- → "Valider heures" est dupliqué entre les deux onglets.

**Cible** :
- `/mobile/chef/equipe` → 3 sous-tabs : **Staffer / Saisir / Valider** (heures).
- `/mobile/chef/atelier` (renommage) → **plus de sous-tab Heures**.

**Implémentation** :
- Déplacer le composant existant `ValiderHeuresEquipe` (ou équivalent) de `mobile.chef.a-valider.heures.tsx` vers un nouveau sous-tab dans `mobile.chef.equipe.tsx`.
- Supprimer la route `/mobile/chef/a-valider/heures`.
- Conserver la logique métier intacte (audit `heures_validations`, RLS `current_user_is_chef_on_affaire`).

---

## 2. Rename "À valider" → "Atelier"

**Routes** :
- `mobile.chef.a-valider.tsx` → `mobile.chef.atelier.tsx`
- `mobile.chef.a-valider.objets.tsx` → `mobile.chef.atelier.objets.tsx`
- (nouveaux) `mobile.chef.atelier.chantiers.tsx`, `mobile.chef.atelier.photos.tsx`
- Ajouter un index redirect `mobile.chef.atelier.index.tsx` → `objets`.

**Bottom nav** (`ChefMobileBottomNav.tsx`) :
- Label : "Atelier"
- Icône : `Hammer` (lucide-react)
- Badge compteur : reste sur objets en attente de validation (hook `useChefAValider` réutilisé, mais ne compte plus les heures puisqu'elles ont migré).

**Hook `useChefAValider`** : adapter pour ne plus retourner `heuresCount` dans `totalCount` du badge Atelier. Le compteur "heures à valider" peut être affiché dans le sous-tab Valider de l'onglet Équipe (badge sur sous-tab interne).

---

## 3. 3 sous-tabs Atelier

### 3a. Objets fab (existant, inchangé)
- Validation objet via `fabrication_objets.statut_chef` + `statut_chef_updated_by` + `statut_chef_updated_at`.
- Garder le composant tel quel, juste réimporté dans la nouvelle route.

### 3b. Vue chantier kanban (NOUVEAU)
**Layout** :
- Filtres en haut : multi-select chantier (mes affaires actives où je suis chef) + multi-select métier.
- Kanban horizontal scrollable, 4 colonnes : **Bois → Peinture → Manut → Validé**.
- Chaque carte = un objet (`fabrication_objets`) : nom + référence + thumbnail (1ère photo si dispo) + badge chantier.
- Tap carte → bottom-sheet détail objet avec actions :
  - Avancer étape (mutation `statut_chef` ou progression `fabrication_etapes`).
  - Valider (mutation `statut_chef='valide'`).
  - Voir photos (lien vers galerie objet 3c).

**Source de données** :
- Hook `useChantierKanbanObjets({ affaireIds, metierIds })` : joint `fabrication_objets` + `fabrication_etapes` (dernière étape) + `affaires` + 1ère `affaire_documents` (thumbnail) where `objet_id = objet.id`.
- Mapping étape → colonne kanban : on déduit la colonne via `fabrication_etapes.type_etape` la plus avancée non terminée. Si `statut_chef='valide'` → colonne "Validé".

### 3c. Photos par objet (NOUVEAU)
**Workflow** :
1. Liste des objets de mes chantiers actifs (groupés par affaire, accordion).
2. Tap objet → galerie photos filtrée `affaire_documents WHERE objet_id = X`.
3. FAB "Prendre photo" → input file `capture="environment"` → compression client → upload bucket `affaires-photos` (existant) avec `affaire_id` parent + `objet_id` renseigné.
4. Lightbox + caption + date (réutilisation `PhotoLightbox` Sprint 2).

---

## 4. DB Migration : extension `affaire_documents`

**Décision à valider** :
```sql
ALTER TABLE public.affaire_documents
  ADD COLUMN objet_id uuid REFERENCES public.fabrication_objets(id) ON DELETE SET NULL;

CREATE INDEX idx_affaire_documents_objet_id
  ON public.affaire_documents(objet_id)
  WHERE deleted_at IS NULL AND objet_id IS NOT NULL;
```

**Justification du choix (vs nouvelle table `objet_photos`)** :
- ✅ Une photo a UNE et une seule affaire ; rattacher à un objet est optionnel → 1:N naturel via FK nullable.
- ✅ RLS existantes inchangées (toujours scoping par `affaire_id`).
- ✅ Galerie globale affaire (Sprint 2) continue de fonctionner sans modification (pas de filtre `objet_id`).
- ✅ Galerie objet = même table + filtre `WHERE objet_id = X`.
- ✅ `ON DELETE SET NULL` : si l'objet est supprimé, la photo reste rattachée au chantier (pas perdue).
- ❌ Alternative table dédiée `objet_photos` : duplication RLS, double bucket potentiel, complique vue globale chantier.

**Pas de changement RLS** — les policies actuelles (`is_admin OR user_has_affaire_access OR user_is_mentioned_on_affaire` pour SELECT, `current_user_is_chef_on_affaire` pour INSERT) couvrent déjà le cas. `objet_id` est métadonnée pure.

**Storage path inchangé** : `{affaire_id}/{document_id}.{ext}` — l'objet_id n'apparaît pas dans le path (sinon déplacement = re-upload). Le filtre se fait sur la colonne BDD.

---

## 5. Front

**Nouveau hook** `src/hooks/use-objet-photos.ts` :
- `useObjetPhotos(objetId)` → wrapper `useAffaireDocuments` filtré client-side OU server fn dédiée `listObjetDocuments({ objetId })`.
- `uploadObjetPhoto(objetId, affaireId, file)` → réutilise `confirmAffaireDocumentUpload` en passant `objet_id` dans le payload.

**Server functions** (`src/lib/affaire-documents.functions.ts`) :
- Étendre `createAffaireDocumentUploadUrl` et `confirmAffaireDocumentUpload` pour accepter `objetId?: string` optionnel.
- Ajouter `listObjetDocuments({ objetId })` avec check : `user_has_affaire_access` sur l'affaire parent de l'objet.

**Composants** (réutilisation max Sprint 2) :
- `AffaireDocumentsGallery` → ajouter prop `objetId?: string` pour filtrer.
- `AffaireDocumentUploader` → ajouter prop `objetId?: string` propagée à l'upload.
- Nouveau : `ObjetSelector.tsx` (liste objets de mes chantiers actifs avec accordion par affaire).
- Nouveau : `ChantierKanban.tsx` (4 colonnes scrollables).
- Nouveau : `KanbanFilters.tsx` (multi-select chantier + métier).
- Nouveau : `ObjetDetailSheet.tsx` (bottom-sheet actions rapides).

---

## 6. Tests E2E

**Nouveau fichier** `e2e/mobile-chef/sprint-v0441-atelier.chef.spec.ts` :
1. Login chef → `/mobile/chef/atelier` → 3 sous-tabs visibles (Objets / Chantiers / Photos).
2. Sous-tab Chantiers → kanban 4 colonnes, filtre chantier OK.
3. Sous-tab Photos → sélection objet "Chaise Beech 1" → FAB caméra → upload → photo apparaît galerie objet.
4. Vérification : la même photo apparaît aussi dans `/mobile/chef/affaires/<id>` (galerie globale Sprint 2).
5. Login chef → `/mobile/chef/equipe` → 3 sous-tabs (Staffer / Saisir / Valider).
6. Sous-tab Valider → liste heures à valider (même comportement qu'avant le déplacement).
7. Vérifier que `/mobile/chef/a-valider` redirige ou 404 propre (pour pas casser bookmarks → on ajoute redirect `/mobile/chef/a-valider` → `/mobile/chef/atelier`).

---

## Ordre d'exécution

1. **DB migration** : ajout colonne `objet_id` + index (à approuver via `supabase--migration`).
2. **Server fns** : étendre upload/list pour `objetId`, ajouter `listObjetDocuments`.
3. **Hook** `use-objet-photos.ts`.
4. **Routes Atelier** : créer `mobile.chef.atelier.{tsx,objets,chantiers,photos}.tsx`, redirect ancienne route.
5. **Composants kanban** + filtres + bottom-sheet.
6. **Routes Équipe** : ajouter sous-tab Valider, déplacer composant heures.
7. **Bottom nav** : Hammer + label Atelier.
8. **E2E** spec v0.44.1.
9. **Memory** + checklist v0.44.1.

---

## Points d'attention

- **Storage path** : on NE change PAS le path (pas de `{affaire_id}/{objet_id}/...`). L'objet_id est purement métadonnée DB, sinon on devrait déplacer les fichiers existants.
- **Backward compat URL** : redirect `/mobile/chef/a-valider/*` → `/mobile/chef/atelier/*` (1 route stub avec `redirect`).
- **Badge bottom nav** : si on retire le compteur heures du badge Atelier, vérifier que le badge reflète bien uniquement objets à valider (sinon UX perturbante).
- **Kanban performance** : limiter aux affaires actives du chef (via `mes_affaires_chef`), pagination/lazy si > 100 objets.

---

## Estimation
~12-15h. Migration triviale (1 colonne + index). Le gros du travail est le kanban + nouvelle UX Photos par objet.

**Question avant code** : OK pour étendre `affaire_documents.objet_id` (vs créer table dédiée `objet_photos`) ?
