# ADR-002 — `objet_id` nullable sur `affaire_documents`

- **Statut** : Accepted
- **Date** : 10 mai 2026
- **Version** : v0.44.1
- **Auteurs** : équipe Staffer Pro

## Contexte

Sprint 1 Hub Chef Mobile (v0.43.0) a introduit le module photos/documents :
une affaire peut porter une galerie de fichiers (`affaire_documents`, bucket
privé `affaires-photos`).

Le Sprint 1 Atelier (v0.44.1) a ensuite ajouté la notion de **photo par objet
de fabrication** (chef peinture qui photographie un panneau bois précis,
chef bois qui photographie un châssis). Deux options se sont présentées :

- **Option A** : nouvelle table `fabrication_objets_photos` séparée, photos
  d'objet n'apparaissent QUE sur l'objet.
- **Option B** : ajouter `objet_id` (nullable) sur `affaire_documents` →
  une photo peut être attachée à une affaire seule (objet_id NULL) OU à un
  objet (objet_id renseigné) — dans les deux cas elle reste visible dans la
  galerie globale du chantier.

## Décision

**Option B retenue** : `affaire_documents.objet_id` UUID nullable, FK vers
`fabrication_objets(id)` avec `ON DELETE SET NULL`.

```sql
ALTER TABLE affaire_documents
  ADD COLUMN objet_id uuid REFERENCES fabrication_objets(id) ON DELETE SET NULL;
```

Le filtre côté hook `useAffaireDocuments({ objetId })` :
- `objetId === undefined` → toutes les photos de l'affaire
- `objetId === null` → uniquement les photos non rattachées
- `objetId === "..."` → uniquement les photos de cet objet

## Conséquences

### Positives
- **Cardinalité 1:N affaire→photo conservée** ; pas de jointure cross-table
  à maintenir.
- **Robustesse à la suppression d'objet** : `ON DELETE SET NULL` →
  la photo reste sur le chantier même si l'objet est supprimé / renommé.
- Galerie globale du chantier reste exhaustive (visible par défaut).
- Un seul bucket, un seul hook, un seul jeu de RLS à maintenir.

### Négatives
- Une fois `objet_id` SET NULL, on perd la trace de l'objet source. Acceptable
  car la photo a une `description` libre que le chef remplit.
- Le filtre côté hook doit être passé explicitement par les vues
  "Photos par objet" (Sprint 2 Atelier).

### Index dédié
```sql
CREATE INDEX idx_affaire_documents_objet_id
  ON affaire_documents (objet_id)
  WHERE deleted_at IS NULL AND objet_id IS NOT NULL;
```

## Alternatives rejetées

- **Table séparée `fabrication_objets_photos` exclusive** : duplication des
  RLS, du compresseur image, du soft-delete, des signed URLs.
  (Cette table existe pour un autre cas d'usage — pas pour les photos chantier.)

## Références

- v0.44.0 — création `affaire_documents` (bucket privé, soft delete, RLS Option D)
- v0.44.1 — ajout `objet_id` + hook `useObjetPhotos`
- v0.44.3 — `deleted_by` + RPC `soft_delete_affaire_document` + vue
  admin `v_documents_supprimes_30j`
