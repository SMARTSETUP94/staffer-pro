---
name: Documents/Photos par affaire
description: v0.44.0 Sprint 2 — bucket privé affaires-photos + table affaire_documents + galerie desktop/mobile + RLS scope chef
type: feature
---
# Sprint 2 v0.44.0 — Documents / Photos par affaire

## Stack
- **Table** : `affaire_documents` (soft delete via `deleted_at`).
- **Bucket** : `affaires-photos` privé, accès via signed URL TTL 1h.
- **Storage path** : `{affaire_id}/{document_id}.{ext}` — l'affaire_id en premier folder permet aux policies storage de matcher la RLS table.

## RLS (Option D)
- SELECT : `is_admin() OR user_has_affaire_access(affaire_id) OR user_is_mentioned_on_affaire(affaire_id)`.
- INSERT : `is_admin() OR current_user_is_chef_on_affaire(affaire_id)` + `uploaded_by = auth.uid()`.
- UPDATE (caption / prise_le / soft delete) : auteur OR admin.
- DELETE physique : admin uniquement. Suppression normale = soft via UPDATE deleted_at.
- Storage RLS calque la table : INSERT vérifie `current_user_is_chef_on_affaire((foldername(name))[1]::uuid)`.

## Composants
- Hook : `src/hooks/use-affaire-documents.ts` — list/upload/update/delete + cache signed URLs.
- Compression : `src/lib/image-compression.ts` — JPEG q=80 max 2560px côté long.
- UI partagée : `src/components/affaire-documents/` (Gallery, Uploader, Lightbox, Thumbnail).
- Desktop : `/affaires/$id/documents` + onglet ajouté au layout `_app.affaires.$affaireId.tsx`.
- Mobile chef : `/mobile/chef/affaires/$id` (drill-down depuis cards dashboard).

## Validation
- MIME whitelist : jpeg/png/webp/heic/pdf.
- Taille max 10 MB après compression.
- Compression client AVANT upload pour photos mobiles natives.

## E2E
- `e2e/mobile-chef/sprint2-documents.chef.spec.ts` (3 scénarios admin + chef + RLS forgé).

## Non livré (assumé)
- Pas d'extraction EXIF auto.
- Pas de drag&drop natif desktop (file picker uniquement).
- Pas de pagination (scope MVP).
