# Images des devis par l'IA, par zone et par objet — plan à relire

Rien n'est appliqué. Migrations additives ; la seule ouverture de droit (M0) est signalée.

## Bibliothèque PDF côté serveur (Worker)
- **unpdf** (build pdf.js « serverless », sans dépendance Node) : lecture du texte par page et **extraction des images incorporées** (pixels bruts), réencodées en PNG/JPEG avec **fflate + jpeg-js** (pur JS). Fonctionne dans le Worker.
- **Rendu de page : impossible côté serveur** (pdf.js a besoin d'un canvas, absent du Worker). Proposition : la vignette de page est rendue **dans le navigateur** (pdf.js) par la personne qui ouvre la boîte ou l'éditeur, puis déposée comme document dérivé ; tant qu'elle n'existe pas, l'IA dispose des images extraites et du texte de la page. Si vous refusez ce rendu navigateur : images extraites seules, et l'IA lit aussi le PDF entier en direct (voir C).
- Limites : 30 pages, 20 Mo par PDF, images < 300 px ou < 20 Ko ignorées, 40 images par PDF au plus. Échec lisible dans la boîte (« PDF trop lourd : 34 Mo, limite 20 Mo », « PDF protégé », « délai dépassé »).

## A. Pages et images des PDF
- À la suite de chaque classement (manuel, automatique, ajout direct), une ligne « à extraire » est notée ; l'extraction tourne au relevé périodique (3 PDF par passage) ou à la demande (bouton « Extraire les images »), jamais dans le classement lui-même.
- Chaque image ou page devient un **document dérivé** dans `affaire_documents` (même table, même stockage privé `affaires-photos`) : `document_parent_id`, `page`, `derive_type` (`page` | `image`), `texte_page` (texte brut tronqué à 4 000 caractères). Cachés par défaut dans la boîte (« Afficher les pages et images extraites »), ajoutables au devis. Choix justifié : les dérivés héritent de l'affaire, de la règle de lecture `section.affaires` et du retrait logique du parent, sans seconde table.
- Retirer un PDF retire logiquement ses dérivés (trigger), jamais de suppression physique.

## B. Tri de la boîte
- Catégories : `brief`, `plan`, `visuel`, `reperage`, `offre_fournisseur`, `autre` (contrainte sur `categorie`, valeurs existantes : toutes NULL). Catégorie IA posée à l'entrée si vide, modifiable à la main ; `categorie_source` = `ia` | `humain` (l'IA ne réécrit jamais un choix humain).
- `nom_lisible` proposé (ex. « Hermès — miroir — chiffrage »), `filename` d'origine conservé et affiché en dessous.
- `empreinte_sha256` calculée à l'entrée (et rétro-calculée à l'extraction) ; doublons d'une même affaire regroupés à l'affichage (« reçu 3 fois »), aucun retrait automatique.
- Filtres catégorie / origine (email, ajout manuel, extrait d'un PDF) / date ; vignettes signées 10 min.

## C. « Proposer les images » dans l'éditeur
- Données envoyées : arbre (zones, objets : libellé, descriptif client, dimensions, finition — **ni prix, ni coûts**), candidats (id, catégorie, nom lisible, page, texte de page, vignette réduite à 512 px). Images déjà dans le devis (`source_document_id`) exclues d'office.
- Sortie en **schéma JSON strict** (outil `propositions` : `ligne_id`, `document_id`, `confiance` 0–100, `justification` ≤ 160 car., `legende` ≤ 80 car., `visible_client`) ; tout id inconnu, doublon sur un objet ou champ en trop est écarté côté serveur. Contenu des documents = donnée : le texte d'un PDF ne peut ni déclencher d'action ni modifier l'arbre.
- Visible client par défaut : oui pour `visuel`, non pour `plan` et `reperage`, non sinon. Légende filtrée (pas de montant, pas d'€, pas de mot interne).
- Écran de revue : arbre à gauche, propositions à droite, cases à cocher, glisser une image vers un autre objet, « Tout accepter au-dessus de 80 % ». À la validation, chaque image est copiée dans `devis-photos` puis ajoutée par `devis_photo_ajouter` avec `source_document_id` (copie retirée si l'ajout échoue, voir M0). Rien sans validation ; brouillon seulement (règles actuelles de l'éditeur).
- **Modèle** : `google/gemini-3-flash-preview` via Lovable AI. **1 appel** par proposition (jusqu'à 60 vignettes), **2 appels** au-delà (lots), plafond **4 appels et 0,10 € par devis et par clic**, au plus 5 propositions par devis et par heure (compteur dans la table de propositions). Catégorisation : 1 appel par document à l'entrée (nom + type + vignette ou 1re page), environ 0,002 €.
- Les propositions sont gardées 7 jours (`devis_propositions_photos`) pour la revue et l'outil Claude ; ce n'est pas un doublon de `devis_photos` (rien n'est ajouté au devis).

## D. Outil Claude
- `devis_proposer_photos(devis_id)` : lecture seule, même calcul, renvoie zone/objet, document, confiance, justification, visible client, légende ; audit et client de l'appelant ; compte dans le plafond.
- `devis_ajouter_photo` accepte un `document_id` dérivé (même contrôle : même affaire, non retiré, JPG/PNG réels) ; aperçu puis confirmation, autonomie seulement sur brouillon créé par Claude et non repris, conversation sur demande explicite.

## Essai prévu
9518 Hermès, devis d'essai à trois objets (miroir, cimaise, paravent textile) : chaque PDF sur son objet ; écrans 390 et 1366 px ; temps mesuré ; devis d'essai et propositions effacés (retrait logique + nettoyage des copies d'essai) ; compte rendu écran / base / tests.

## Migrations (texte à relire)

**M0 — retrait des copies orphelines (ouvre un droit, limité)**
```sql
CREATE POLICY devis_photos_storage_delete_orphelin ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'devis-photos' AND name NOT LIKE 'entreprise-logo/%'
  AND public.current_user_has_capability('devis.rediger')
  AND owner_id = auth.uid()::text
  AND NOT EXISTS (SELECT 1 FROM public.devis_photos p WHERE p.storage_path = storage.objects.name));
```

**M1 — boîte de documents**
```sql
ALTER TABLE public.affaire_documents
  ADD COLUMN document_parent_id uuid REFERENCES public.affaire_documents(id) ON DELETE SET NULL,
  ADD COLUMN page integer CHECK (page IS NULL OR page BETWEEN 1 AND 30),
  ADD COLUMN derive_type text CHECK (derive_type IS NULL OR derive_type IN ('page','image')),
  ADD COLUMN texte_page text CHECK (texte_page IS NULL OR length(texte_page) <= 4000),
  ADD COLUMN empreinte_sha256 text CHECK (empreinte_sha256 IS NULL OR empreinte_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN nom_lisible text CHECK (nom_lisible IS NULL OR length(nom_lisible) <= 120),
  ADD COLUMN categorie_source text CHECK (categorie_source IS NULL OR categorie_source IN ('ia','humain')),
  ADD COLUMN extraction jsonb CHECK (extraction IS NULL OR jsonb_typeof(extraction) = 'object');
ALTER TABLE public.affaire_documents ADD CONSTRAINT affaire_documents_categorie_chk
  CHECK (categorie IS NULL OR categorie IN ('brief','plan','visuel','reperage','offre_fournisseur','autre'));
ALTER TABLE public.affaire_documents ADD CONSTRAINT affaire_documents_derive_chk
  CHECK ((document_parent_id IS NULL) = (derive_type IS NULL));
CREATE UNIQUE INDEX affaire_documents_derive_uniq ON public.affaire_documents (document_parent_id, derive_type, page, empreinte_sha256)
  WHERE document_parent_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX affaire_documents_empreinte_idx ON public.affaire_documents (affaire_id, empreinte_sha256) WHERE deleted_at IS NULL;
-- Un dérivé appartient à la même affaire que son parent ; retirer le parent retire ses dérivés.
CREATE FUNCTION public.affaire_documents_derive_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.document_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM affaire_documents p
     WHERE p.id = NEW.document_parent_id AND p.affaire_id = NEW.affaire_id AND p.document_parent_id IS NULL) THEN
    RAISE EXCEPTION 'Document parent invalide';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_affaire_documents_derive_guard BEFORE INSERT OR UPDATE OF document_parent_id, affaire_id
  ON public.affaire_documents FOR EACH ROW EXECUTE FUNCTION public.affaire_documents_derive_guard();
CREATE FUNCTION public.affaire_documents_retrait_derives() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE affaire_documents SET deleted_at = NEW.deleted_at, deleted_by = NEW.deleted_by
     WHERE document_parent_id = NEW.id AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_affaire_documents_retrait_derives AFTER UPDATE OF deleted_at ON public.affaire_documents
  FOR EACH ROW EXECUTE FUNCTION public.affaire_documents_retrait_derives();
```
Triggers en invoker (pas de SECURITY DEFINER) : ils s'exécutent sous les droits de l'appelant et les règles existantes. Le rôle service (extraction périodique) insère avec `uploaded_by` = auteur du PDF parent.

**M2 — propositions**
```sql
CREATE TABLE public.devis_propositions_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL REFERENCES public.devis(id) ON DELETE CASCADE,
  demande_par uuid NOT NULL,
  canal text NOT NULL CHECK (canal IN ('app','mcp')),
  modele text NOT NULL, appels smallint NOT NULL CHECK (appels BETWEEN 1 AND 4),
  cout_estime_eur numeric(6,4) NOT NULL CHECK (cout_estime_eur <= 0.10),
  duree_ms integer, propositions jsonb NOT NULL CHECK (jsonb_typeof(propositions) = 'array' AND jsonb_array_length(propositions) <= 300),
  cree_le timestamptz NOT NULL DEFAULT now(), expire_le timestamptz NOT NULL DEFAULT now() + interval '7 days');
GRANT SELECT, INSERT ON public.devis_propositions_photos TO authenticated;
GRANT ALL ON public.devis_propositions_photos TO service_role;
ALTER TABLE public.devis_propositions_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY dpp_lecture ON public.devis_propositions_photos FOR SELECT TO authenticated
  USING (public.devis_peut_lire(devis_id) AND public.current_user_has_capability('devis.rediger'));
CREATE POLICY dpp_ajout ON public.devis_propositions_photos FOR INSERT TO authenticated
  WITH CHECK (demande_par = auth.uid() AND public.devis_peut_lire(devis_id) AND public.current_user_has_capability('devis.rediger')
    AND (SELECT count(*) FROM public.devis_propositions_photos x WHERE x.devis_id = devis_propositions_photos.devis_id AND x.cree_le > now() - interval '1 hour') < 5);
```
Pas de mise à jour ni de suppression par l'app ; aucune fonction SECURITY DEFINER nouvelle. `devis_mcp_appliquer` et `devis_photo_ajouter` inchangés (le dérivé est une ligne de `affaire_documents`, déjà contrôlée par affaire).

## Questions
1. Rendu des pages dans le navigateur : d'accord, ou images extraites seules ?
2. M0 : d'accord pour donner le retrait des copies orphelines à leur auteur ?
