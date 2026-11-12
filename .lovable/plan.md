# Lot « Pièces jointes des demandes → documents d'affaire → devis »

## Partie A — rétablir l'ouverture des documents (migration séparée, appliquée en premier)

Constat relu en base : `affaires_photos_business_read` exige `user_has_affaire_access(d.affaire_id)` (affectation planifiée). `affaires_photos_select` (admin ou affecté/mentionné) reste inchangée.

Avant (en base aujourd'hui) :
```sql
CREATE POLICY "affaires_photos_business_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'affaires-photos' AND EXISTS (
  SELECT 1 FROM public.affaire_documents d
  WHERE d.storage_path = objects.name AND d.deleted_at IS NULL
    AND public.user_has_affaire_access(d.affaire_id)));
```
Après (migration `documents_affaire_lecture_section_affaires`) :
```sql
DROP POLICY IF EXISTS "affaires_photos_business_read" ON storage.objects;
CREATE POLICY "affaires_photos_business_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'affaires-photos'
  AND public.current_user_has_capability('section.affaires')
  AND EXISTS (SELECT 1 FROM public.affaire_documents d
              WHERE d.storage_path = objects.name AND d.deleted_at IS NULL));
```
Retour arrière : recréer le texte « Avant ». Aucune autre règle de la 0119 touchée.

Vérifications A : signature de vignettes et liens (`createSignedUrl`) passent par la lecture `storage.objects` du client connecté — je repère tous les appels et confirme qu'aucun n'utilise le client admin ; essai en base (`set role authenticated` + claims) d'un compte `commercial` non affecté sur un document 9515 → lu ; compte `employe` → refusé ; écran avec une session commercial si une existe, sinon dit.

## Partie B — circuit mail → documents → devis

### 1. Classement automatique
- Nouvelle fonction serveur `classerPiecesJointesDemande(emailId, affaireId)` (client de l'utilisateur, RLS) qui réutilise le cœur de `saveEmailDocument` extrait en fonction pure + étape d'écriture ; appelée après rattachement depuis : création d'opportunité depuis la demande, « Classer dans une affaire », Qualité des données, et l'outil Claude `traiter_demande` (après confirmation, avec le client de l'appelant MCP).
- Appel non bloquant : le rattachement est enregistré d'abord ; le classement suit. Si Microsoft ne répond pas : 2 tentatives courtes, puis trace « à reprendre » sur la demande ; le relevé périodique devis@ existant (lecture seule) relance les demandes rattachées en attente, au plus 3 fois.
- Trace : `emails_entrants.metadata_ia` n'est pas réutilisé ; ajout d'une colonne `classement_pj jsonb` (état, date, liste pièce → classée / doublon / refusée + motif lisible). Colonne additive, écrite par une fonction `emails_classement_pj_enregistrer` (SECURITY DEFINER, contrôle `section.affaires` + `demandes_clients.view`, REVOKE PUBLIC/anon).
- Anti-doublon : (affaire, source_email_id, source_attachment_id) déjà en place. Types/tailles : `validateEmailDocument`. Description « Email : objet ».
- Images collées (`isInline`) classées sauf logos de signature. Règle proposée (pure, testée) : écartée si taille < 15 Ko, OU largeur ou hauteur < 200 px (lecture des en-têtes PNG/JPG/GIF), OU nom type `image00x`/`logo`/`signature`/`outlook-` ET < 60 Ko, OU même empreinte déjà vue dans au moins 3 autres mails de l'expéditeur (empreinte calculée au classement, sans nouvelle table : comparaison sur `classement_pj`).
- Une pièce refusée n'arrête pas les autres (boucle par pièce, erreurs collectées).

### 2. Reprise de l'existant (admin)
Bouton dans Qualité des données « Classer les pièces jointes des demandes déjà rattachées » : bilan d'abord (demandes, pièces, déjà classées, inaccessibles — lecture seule Graph de la liste), puis confirmation, traitement par paquets de 10. Non lancé par moi sur les données réelles.

### 3. Éditeur de devis
Sur un objet : « Choisir dans les documents de l'affaire » (vignettes images, nom, origine mail/dépôt). Choix : **copie** du fichier dans `devis-photos` par une fonction serveur, puis écriture via la fonction `devis_*` existante d'ajout de photo. Raison : le PDF client et l'export lisent déjà `devis-photos` ; un document retiré de la boîte ne casse pas un devis validé. Le lien d'origine est gardé dans une colonne additive `devis_photos.source_document_id` (nullable, sans contrainte de suppression). PDF de la boîte : visibles, non ajoutables comme photo.

### 4. Outils Claude
- `documents_affaire` (lecture) : champs explicites (id, nom, type, taille, origine, date), pagination stable, contrôle d'accès à l'affaire par le client de l'appelant, audit existant. Vignette : bloc image MCP réduit (≤ 256 px, au plus 5 par page) si le SDK le gère simplement, sinon omis et dit.
- `devis_ajouter_photo` : nouveau champ `document_id` (exclusif avec URL/base64) ; le serveur vérifie que le document appartient à l'affaire du devis, copie, puis même circuit aperçu → confirmation → `devis_mcp_appliquer`, journal. Jamais de client admin pour la lecture métier.

### Migration B (montrée avant application)
Additive : `emails_entrants.classement_pj jsonb`, `devis_photos.source_document_id uuid`, fonction `emails_classement_pj_enregistrer`, redéfinition (lue fraîchement) de la fonction devis d'ajout de photo pour accepter `source_document_id`. Texte complet présenté au prochain message, avant application.

## Vérifications
- Tests : logo de signature écarté / grande image collée gardée, doublon, pièce refusée qui ne bloque pas, choix document hors affaire refusé, droits.
- Parcours : une demande réelle déjà rattachée (classer ne la modifie pas), ajout d'image à un objet d'un devis d'essai, PDF client généré avec l'image ; 390 px et 1366 px.
- Données d'essai effacées (devis d'essai, photos copiées, documents classés pour l'essai si sur demande d'essai). Compte rendu écran / base / tests, avec ce qui n'a pas pu être vérifié. Rien publié. Outlook en lecture seule, aucun envoi.
