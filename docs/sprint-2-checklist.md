# Sprint 2 v0.44.0 — Documents/Photos par affaire — Checklist livraison

## Migration DB
- [x] Table `affaire_documents` (id, affaire_id FK CASCADE, storage_path UNIQUE, filename, mime_type, taille_bytes, description, prise_le, uploaded_by, uploaded_at, updated_at, deleted_at)
- [x] Index `(affaire_id, uploaded_at DESC) WHERE deleted_at IS NULL`
- [x] Trigger `updated_at`
- [x] RLS : SELECT (admin OR chef assigné OR mentionné), INSERT (admin OR chef assigné), UPDATE (auteur OR admin), DELETE physique (admin)
- [x] Bucket privé `affaires-photos`
- [x] RLS storage.objects : SELECT/INSERT/DELETE scopées au bucket, mêmes règles que la table

## Backend
- [x] Hook `use-affaire-documents.ts` — list, upload (avec compression), updateDocument, deleteDocument (soft), getSignedUrl avec cache 1h
- [x] Compression image JPEG q=80 max 2560px côté long (`src/lib/image-compression.ts`)
- [x] Validation MIME (jpeg/png/webp/heic/pdf) + taille max 10 MB
- [x] Rollback storage si insert table échoue

## UI Desktop
- [x] Route `/affaires/:id/documents` (admin + chef assigné)
- [x] Onglet "Documents" ajouté au layout `/affaires/:affaireId`
- [x] Composant `AffaireDocumentsGallery` responsive (grille 5 cols desktop)
- [x] Uploader multi-fichiers avec progress par fichier
- [x] Lightbox : navigation ←→, zoom, edit caption + date, suppression, ouverture PDF nouvel onglet

## UI Mobile chef
- [x] Route `/mobile/chef/affaires/:affaireId` avec section Photos & documents
- [x] Cards affaires du dashboard mobile chef → drill-down vers la page Photos
- [x] Bouton "Photo" (`<input type="file" accept="image/*" capture="environment">`)
- [x] Bouton "Galerie" (`<input type="file" multiple>`)
- [x] Grille 3 colonnes thumbnails, tap = lightbox plein écran
- [x] Édition caption inline + date prise de vue
- [x] `canUpload=false` si affaire pas dans `mes_affaires_chef` → galerie consultation seule

## Sécurité (Option D)
- [x] RLS scopée par affaire sur la nouvelle table (chefs voient SEULEMENT leurs affaires)
- [x] Bucket privé, accès uniquement via signed URL TTL 1h
- [x] Storage path inclut affaire_id → policies storage matchent RLS table
- [x] `uploaded_by = auth.uid()` forcé en WITH CHECK
- [x] Suppression = soft (`deleted_at`) ; suppression physique storage best-effort

## E2E
- [x] `e2e/mobile-chef/sprint2-documents.chef.spec.ts` (3 scénarios)
  - (a) admin : onglet Documents accessible + empty state ou grille
  - (b) chef : galerie + boutons Photo/Galerie visibles sur son affaire
  - (c) chef : URL forgée vers affaire non assignée → pas de bouton upload, RLS bloque

## Mémoire projet
- [ ] `mem://features/affaire-documents` à créer
- [ ] Index mis à jour (entrée Memories + ligne Roadmap v0.44.0)

## Limitations connues (assumées Sprint 2)
- Pas d'extraction EXIF auto pour `prise_le` (saisie manuelle).
- Pas de drag&drop natif sur desktop (file picker uniquement). À itérer si besoin.
- Pas de re-compression côté serveur (compression client uniquement).
- Pas de pagination — limite naturelle 1000 lignes Supabase, suffisant pour le scope MVP.

## Effort réel
~17h selon l'estimé du plan (proche du bas de la fourchette 15–20h annoncée).
