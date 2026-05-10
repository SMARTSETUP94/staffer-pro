# Plan d'archi — Feature Template Contrat (onglet RH/Contrats)

## État actuel (déjà en place, à compléter)

- ✅ Table `contrat_templates` créée (id, nom, contenu_html, version_int, actif, created_by, timestamps) + UNIQUE partial sur `actif=true`.
- ✅ RPC `create_contrat_template_version` + `activate_contrat_template`.
- ✅ Colonne `contrats_intermittents.template_version_id` (snapshot juridique).
- ✅ `src/lib/contrats-templates.ts` (placeholders, interpolation, listing, RPC wrappers).
- ✅ `ContratTemplateEditor.tsx` (TipTap basique avec preview).
- ✅ `react-pdf-html` câblé dans `contrats-pdf.tsx`.
- ✅ RLS : SELECT actif/admin/employé concerné, INSERT/UPDATE/DELETE admin only.

## Gaps à combler (le travail de ce tour)

### 1. Schéma DB — additif
Migration additive (ne casse rien) :
- `contrat_templates.contenu_json jsonb null` — pour stocker l'AST TipTap (édition fidèle, pas juste round-trip HTML).
- `contrat_templates.notes text null` — note de version (changelog).
- Adapter `create_contrat_template_version(p_nom, p_contenu_html, p_contenu_json, p_actif, p_notes)`.
- Seed v1 actif **uniquement si table vide** (prend le HTML hardcodé actuel `DEFAULT_CONTRAT_TEMPLATE_HTML` comme v1 — pas de réécriture juridique, c'est le job de Gabin).

### 2. Routing & RBAC — onglets dans `/rh/contrats`
- Garder la route `_app.rh.contrats.tsx` mais réorganiser en 2 sous-onglets (`<Tabs>` shadcn) :
  - **Liste contrats** (contenu actuel)
  - **Template contrat** (visible si `is_admin` ou rôle RH — réutilise garde existante de la route)
- Pas de nouvelle route, juste un state `tab` local + URL search param `?tab=template` pour deeplink.

### 3. Éditeur TipTap enrichi (`ContratTemplateEditor.tsx`)
Étend l'existant avec :
- **Extensions** : StarterKit (déjà), Underline, TextAlign, Table + TableRow + TableCell + TableHeader, HardBreak (saut de page CSS `page-break-after`), BulletList/OrderedList (StarterKit OK).
- **Custom Node `Placeholder`** : node atomic inline `{{var}}` rendu en badge stylé (Tailwind `bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs font-mono`). Sérialise en `{{var}}` côté HTML pour interpolation côté PDF.
- **Toolbar** : groupes
  - Format : B / I / U
  - Titres : H1 / H2 / H3 / paragraphe
  - Listes : • / 1.
  - Alignement : ←  ↔  →
  - Tableau : insérer 3×3
  - Saut de page : bouton dédié
  - **Insérer variable** : `<DropdownMenu>` groupé par catégorie (Employé / Mission / Tarif / Employeur / Signature) → insère le node Placeholder.
- Bundle : `@tiptap/extension-underline`, `@tiptap/extension-text-align`, `@tiptap/extension-table*` (4 packages).

### 4. Preview live (panneau droit)
- Layout 2 colonnes (≥ lg) : éditeur gauche, preview droite scrollable, sticky header.
- Debounce 300ms (lodash ou custom hook `useDebounce`).
- Rendu = `interpolateContratTemplate(html, EXAMPLE_CONTRAT_TEMPLATE_VALUES)` injecté via `dangerouslySetInnerHTML` dans une `div.prose` mimant le style PDF (a4-like, padding, fonts).
- Switch « Voir avec placeholders bruts / Voir interpolé ».

### 5. Sidebar versions (panneau secondaire)
- Liste `listContratTemplates()` triée par `version_int desc`.
- Carte par version : badge "Actif" si `actif=true`, date FR, auteur (résolu via `profiles`), notes.
- Actions par carte :
  - **Charger dans l'éditeur** (lecture seule si pas active, sinon édition).
  - **Activer cette version** (RPC `activate_contrat_template`).
  - **Restaurer** : clone le contenu_html/json dans l'éditeur en mode "nouveau brouillon" (n'écrase pas la version source).

### 6. Boutons d'action
- **Sauvegarder brouillon** → `create_contrat_template_version(actif=false)`.
- **Sauvegarder et activer** → RPC unique `create_contrat_template_version(actif=true)` (qui désactive l'ancienne actif via trigger ou dans la fonction).
- Toast succès + invalidation react-query `["contrat_templates"]`.
- Confirmation `<AlertDialog>` avant activation ("Cette version remplacera celle utilisée pour les nouveaux contrats. Les contrats existants restent rattachés à leur version d'origine.").

### 7. Génération PDF — snapshot juridique
- Au moment de créer un `contrat_intermittent` (recherche dans `contrats-signature.ts` / là où le contrat est inséré) :
  - SELECT template actif → set `template_version_id` sur la ligne.
  - Fallback : si aucun template actif → utilise `DEFAULT_CONTRAT_TEMPLATE_HTML` (sécurité).
- Edge function `contrat-pdf` :
  - Lit `contrats_intermittents.template_version_id` → fetch `contrat_templates.contenu_html` correspondant.
  - Construit le `values` (employé, dates, taux…) → `interpolateContratTemplate(html, values)` → injecte dans `react-pdf-html`.
  - Si `template_version_id` null → fallback hardcode.

### 8. Mapping placeholders → données contrat
Helper `buildContratValues(contrat, employe, affaire, signatures)` côté edge fn qui retourne le dict pour interpolation. Gère les formats FR (dates `dd MMMM yyyy`, montants `18,00 €`, etc.).

## Ordre d'implémentation

1. Migration DB additive (`contenu_json`, `notes`, RPC v2, seed v1).
2. Custom Node Placeholder TipTap + extensions (Underline/TextAlign/Table).
3. Toolbar enrichie + dropdown "Insérer variable" groupé.
4. Layout 3 colonnes (versions / éditeur / preview).
5. Câblage actions Sauver brouillon / Activer / Restaurer.
6. Branchement onglets `<Tabs>` dans `_app.rh.contrats.tsx`.
7. Branchement `template_version_id` à la création contrat.
8. Edge function `contrat-pdf` lit template DB + fallback.
9. Mapping `buildContratValues` complet (16 placeholders).
10. Test E2E manuel selon scénario Gabin.

## Hors-scope (rappel)

- ❌ Pas de réécriture du texte juridique : seed v1 = contenu hardcodé actuel tel quel, Gabin l'éditera lui-même.
- ❌ Pas de modification UI Liste contrats (déjà OK).
- ❌ Pas de re-fix Signer / PDF (résolus).

## Risques / points d'attention

- **TipTap Table dans react-pdf-html** : `react-pdf-html` ne supporte pas tous les CSS — tester rendu `<table>` PDF, fallback `border-collapse` inline si besoin.
- **Placeholder Node sérialisation** : doit produire `{{var}}` exact dans `getHTML()` pour que l'interpolation regex matche.
- **Atomicité activation** : si la RPC actuelle ne fait pas le toggle dans une transaction, l'ajuster (UPDATE actif=false WHERE actif=true; UPDATE actif=true WHERE id=p_id; dans un BEGIN/COMMIT plpgsql).
- **Rollback** : si table vide ou template corrompu → fallback hardcode systématique.

Validez ce plan et je commit.