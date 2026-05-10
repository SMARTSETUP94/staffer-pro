# Sprint 2 v0.44.0 — Documents / Photos par affaire

**Statut v0.43.1** : ✅ livré (Option D validée). E2E 7 scénarios, scope dur StafferMobileForm, checklist `docs/sprint-1-checklist.md`. Le hardening RLS strict est différé en v0.45 (sprint dédié + audit + migration comptes contrôlée).

**Effort estimé Sprint 2** : ~17h (proche du bas de la fourchette 15-20h annoncée).

---

## 1. Stockage — bucket privé `affaires-photos`

- Bucket **privé** (jamais d'URL publique directe).
- Accès via **signed URL** TTL 1h générée à la demande.
- Convention de path : `{affaire_id}/{document_id}.{ext}` (pas de filename utilisateur en clair → évite collisions + injection).
- Limite côté client : 10 MB par fichier, MIME `image/jpeg|png|webp|heic` + `application/pdf`.
- Compression mobile : JPEG qualité 80 via canvas avant upload (max 2560px côté long).

## 2. Schéma DB — table `affaire_documents`

```text
affaire_documents
├─ id              uuid PK
├─ affaire_id      uuid FK affaires(id) ON DELETE CASCADE, NOT NULL, indexé
├─ storage_path    text NOT NULL UNIQUE  -- {affaire_id}/{id}.{ext}
├─ filename        text NOT NULL         -- nom original (affichage)
├─ mime_type       text NOT NULL
├─ taille_bytes    bigint NOT NULL
├─ description     text NULL             -- caption éditable
├─ prise_le        date NULL             -- date de prise de vue (EXIF ou saisie)
├─ uploaded_by     uuid FK auth.users(id) NOT NULL
├─ uploaded_at     timestamptz NOT NULL default now()
└─ deleted_at      timestamptz NULL      -- soft delete (récup admin si besoin)
```

Index : `(affaire_id, uploaded_at DESC) WHERE deleted_at IS NULL`.

## 3. RLS — scope par affaire (Option D cohérente)

Politiques sur `affaire_documents` :
- **SELECT** : `is_admin()` OR `user_has_affaire_access(affaire_id)` (helper existant qui couvre chefs assignés + équipe mentionnée).
- **INSERT** : `is_admin()` OR `current_user_is_chef_on_affaire(affaire_id)` (seuls chefs assignés peuvent uploader).
- **UPDATE** (caption / prise_le) : auteur (`uploaded_by = auth.uid()`) OR `is_admin()`.
- **DELETE** : soft delete → on autorise `UPDATE deleted_at` seulement à `is_admin()` OR `uploaded_by = auth.uid()`.

Politiques `storage.objects` bucket `affaires-photos` :
- Lecture/écriture : EXISTS sur `affaire_documents` avec mêmes règles que ci-dessus, en cassant `storage.foldername(name)[1]::uuid` = `affaire_id`.

## 4. Server functions

`src/lib/affaire-documents.functions.ts` :
- `listAffaireDocuments(affaireId)` → liste + signed URLs thumbnails (transform 400px) + originals.
- `createAffaireDocumentUploadUrl({ affaireId, filename, mimeType, taille })` → renvoie `{ documentId, uploadUrl, storagePath }` (signed upload URL, insertion row pré-upload en pending puis confirmation).
- `confirmAffaireDocumentUpload(documentId)` → marque OK, déclenche extraction EXIF côté serveur si image.
- `updateAffaireDocument({ id, description?, prise_le? })`.
- `deleteAffaireDocument(id)` → soft delete + suppression objet storage.

Toutes protégées par `requireSupabaseAuth` + check explicite affaire access (defense in depth, ne pas se reposer uniquement sur RLS pour les checks d'écriture).

## 5. UI Desktop — `/affaires/$id/documents`

Nouvel onglet dans le détail affaire (admin + chef assigné).
- Composant `AffaireDocumentsGallery` : grille thumbnails 200px, tri date desc, filtre par type (photo / pdf).
- Bouton **Uploader** : file picker multi-fichiers + drag&drop → progress bar par fichier.
- Clic thumbnail → `PhotoLightbox` (zoom, navigation ←→, edit caption inline, edit date, supprimer).
- PDFs : icône + clic = ouverture nouvel onglet (signed URL).

## 6. UI Mobile chef — sous-onglet **Photos** dans détail affaire

Route : `/mobile/chef/affaires/$id` (existant si présent, sinon créé) → tab `Photos`.
- Bouton **Prendre une photo** : `<input type="file" accept="image/*" capture="environment">`.
- Bouton **Importer depuis galerie** : même input sans `capture`.
- Compression JPEG 80% avant upload (canvas).
- Grille thumbnails 3 colonnes + tap = lightbox plein écran swipeable.
- Édition caption au tap long.

## 7. Composants à créer

```
src/hooks/use-affaire-documents.ts            (TanStack Query + signed URLs cache 30min)
src/components/affaire-documents/
  ├─ AffaireDocumentsGallery.tsx              (desktop + mobile, responsive)
  ├─ AffaireDocumentUploader.tsx              (drag&drop + caméra)
  ├─ PhotoLightbox.tsx                        (modal zoom + nav)
  └─ DocumentThumbnail.tsx                    (image ou icône PDF)
src/lib/image-compression.ts                  (canvas resize/compress)
src/routes/affaires.$id.documents.tsx         (desktop tab)
src/routes/mobile.chef.affaires.$id.tsx       (mobile détail si manquant) + tab Photos
```

## 8. E2E Playwright (2 specs)

- `affaire-documents-admin.spec.ts` : upload PDF + image, edit caption, delete, vérif RLS (admin voit toutes affaires).
- `affaire-documents-chef-mobile.spec.ts` : chef upload photo sur son affaire, **403** sur affaire non assignée, lightbox, edit caption.

## 9. Migration SQL (un seul fichier)

1. `CREATE TABLE affaire_documents` + index.
2. `INSERT INTO storage.buckets (id, name, public) VALUES ('affaires-photos','affaires-photos', false)`.
3. RLS sur `affaire_documents` (4 policies) + sur `storage.objects` (3 policies scopées au bucket).
4. Trigger `updated_at` standard.

## 10. Memory updates

Ajout à `mem://index.md` :
- `[Documents affaires](mem://features/affaire-documents) — v0.44.0 bucket privé + RLS scope chef`

---

## Ordre d'exécution

1. **Migration SQL** (table + bucket + RLS) — requiert approbation user.
2. Server functions + hooks.
3. UI desktop + composants partagés.
4. UI mobile chef + caméra.
5. E2E specs.
6. Memory + checklist.

**GO ?** Dès validation je crée la migration (étape 1), puis j'enchaîne tout le code.
