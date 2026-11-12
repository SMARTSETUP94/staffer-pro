-- Migration documents_fournisseurs — 12/11/2026. Ajouts et restrictions uniquement.

CREATE TABLE public.materiaux_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chemin text NOT NULL,
  nom_fichier text NOT NULL,
  type_mime text NOT NULL,
  empreinte text NOT NULL,
  fournisseur_id uuid REFERENCES public.fournisseurs_tarifs(id),
  fournisseur_libre text,
  type_document text NOT NULL,
  numero text,
  date_document date,
  valide_jusquau date,
  reference_projet text,
  lignes_ecartees jsonb NOT NULL DEFAULT '[]'::jsonb,
  nb_lignes integer NOT NULL DEFAULT 0,
  depose_par uuid NOT NULL,
  depose_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materiaux_documents_type_chk CHECK (type_document IN ('facture','proposition','confirmation')),
  CONSTRAINT materiaux_documents_empreinte_uniq UNIQUE (empreinte),
  CONSTRAINT materiaux_documents_fournisseur_chk CHECK (fournisseur_id IS NOT NULL OR coalesce(trim(fournisseur_libre),'') <> '')
);
CREATE UNIQUE INDEX materiaux_documents_numero_uniq
  ON public.materiaux_documents (coalesce(fournisseur_id::text, lower(trim(fournisseur_libre))), lower(trim(numero)))
  WHERE coalesce(trim(numero),'') <> '';
GRANT ALL ON public.materiaux_documents TO service_role;
ALTER TABLE public.materiaux_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.materiaux_catalogue
  ADD COLUMN document_origine_id uuid REFERENCES public.materiaux_documents(id),
  ADD COLUMN document_ligne integer,
  ADD COLUMN type_prix text NOT NULL DEFAULT 'reference',
  ADD COLUMN valide_jusquau date;
ALTER TABLE public.materiaux_catalogue
  ADD CONSTRAINT materiaux_type_prix_chk CHECK (type_prix IN ('reference','ponctuel')),
  ADD CONSTRAINT materiaux_ponctuel_date_chk CHECK (type_prix <> 'ponctuel' OR valide_jusquau IS NOT NULL);
CREATE UNIQUE INDEX materiaux_catalogue_document_ligne_uniq ON public.materiaux_catalogue (document_origine_id, document_ligne)
  WHERE document_origine_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.materiaux_document_peut_deposer()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.is_admin() OR (public.current_user_has_capability('devis.rediger') AND public.current_user_has_capability('devis.couts'));
$function$;

CREATE OR REPLACE FUNCTION public.materiaux_document_doublon(_empreinte text, _fournisseur_id uuid DEFAULT NULL, _fournisseur_libre text DEFAULT NULL, _numero text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d record;
BEGIN
  IF NOT materiaux_document_peut_deposer() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM materiaux_documents m
   WHERE (_empreinte IS NOT NULL AND m.empreinte=_empreinte)
      OR (coalesce(trim(_numero),'')<>'' AND lower(trim(m.numero))=lower(trim(_numero))
          AND coalesce(m.fournisseur_id::text, lower(trim(m.fournisseur_libre)))
            = coalesce(_fournisseur_id::text, lower(trim(_fournisseur_libre))))
   ORDER BY (m.empreinte=_empreinte) DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',d.id,'numero',d.numero,'depose_le',d.depose_le,'nom_fichier',d.nom_fichier,
    'raison',CASE WHEN d.empreinte=_empreinte THEN 'fichier' ELSE 'numero' END);
END $function$;

CREATE OR REPLACE FUNCTION public.materiaux_document_rapprocher(_fournisseur_id uuid, _lignes jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_couts boolean := current_user_has_capability('devis.couts'); l jsonb; i int := 0; r jsonb := '[]'::jsonb; v_m jsonb; v_q text;
BEGIN
  IF NOT materiaux_document_peut_deposer() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(_lignes) <> 'array' OR jsonb_array_length(_lignes) > 200 THEN RAISE EXCEPTION 'Lignes invalides'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    v_m := NULL;
    IF _fournisseur_id IS NOT NULL AND coalesce(trim(l->>'ref'),'')<>'' THEN
      SELECT jsonb_build_object('id',m.id,'produit',m.produit,'ref',m.ref,'unite',m.unite,'date_tarif',m.date_tarif,'source',m.source,
               'prix_achat',CASE WHEN v_couts THEN m.prix_achat_net END)
        INTO v_m FROM materiaux_catalogue m
       WHERE m.actif AND m.type_prix='reference' AND m.fournisseur_id=_fournisseur_id AND upper(trim(m.ref))=upper(trim(l->>'ref'))
       ORDER BY m.date_tarif DESC NULLS LAST LIMIT 1;
    END IF;
    v_q := materiaux_norm(coalesce(l->>'produit',''));
    r := r || jsonb_build_object('index',i,'meme_ref',v_m,'proches',
      CASE WHEN v_m IS NOT NULL OR v_q='' THEN '[]'::jsonb ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('id',o.id,'fournisseur',f.nom,'produit',o.produit,'ref',o.ref,'unite',o.unite,
                 'date_tarif',o.date_tarif,'prix_achat',CASE WHEN v_couts THEN o.prix_achat_net END) ORDER BY o.sim DESC)
        FROM (SELECT m.*, similarity(m.search_norm, v_q) sim FROM materiaux_catalogue m
               WHERE m.actif AND m.search_norm % v_q AND (m.valide_jusquau IS NULL OR m.valide_jusquau >= current_date)
               ORDER BY sim DESC LIMIT 3) o LEFT JOIN fournisseurs_tarifs f ON f.id=o.fournisseur_id),'[]'::jsonb) END);
    i := i + 1;
  END LOOP;
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.materiaux_document_soumettre(_doc jsonb, _lignes jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_f uuid := NULLIF(_doc->>'fournisseur_id','')::uuid; v_libre text := NULLIF(trim(_doc->>'fournisseur_libre'),'');
        v_type text := _doc->>'type_document'; v_num text := NULLIF(trim(_doc->>'numero'),''); v_date date := NULLIF(_doc->>'date_document','')::date;
        v_id uuid; l jsonb; i int := 0; n int := 0; v_dbl jsonb; v_src text;
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis');
  IF NOT materiaux_document_peut_deposer() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(_doc->>'empreinte','') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Empreinte du fichier invalide'; END IF;
  IF coalesce(_doc->>'chemin','') !~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(pdf|jpg|jpeg|png)$' THEN RAISE EXCEPTION 'Chemin du fichier invalide'; END IF;
  IF split_part(_doc->>'chemin','/',1) <> auth.uid()::text THEN RAISE EXCEPTION 'Chemin du fichier invalide' USING ERRCODE='42501'; END IF;
  IF split_part(split_part(_doc->>'chemin','/',2),'.',1) <> _doc->>'empreinte' THEN RAISE EXCEPTION 'Empreinte et fichier ne correspondent pas'; END IF;
  IF v_type IS NULL OR v_type NOT IN ('facture','proposition','confirmation') THEN RAISE EXCEPTION 'Type de document invalide'; END IF;
  IF v_f IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM fournisseurs_tarifs WHERE id=v_f) THEN RAISE EXCEPTION 'Fournisseur inconnu'; END IF;
    v_libre := NULL;
  ELSIF v_libre IS NULL THEN RAISE EXCEPTION 'Indiquez le fournisseur';
  END IF;
  IF jsonb_typeof(_lignes) <> 'array' OR jsonb_array_length(_lignes) = 0 OR jsonb_array_length(_lignes) > 200 THEN
    RAISE EXCEPTION 'Aucune ligne à envoyer';
  END IF;
  v_dbl := materiaux_document_doublon(_doc->>'empreinte', v_f, v_libre, v_num);
  IF v_dbl IS NOT NULL THEN RAISE EXCEPTION 'DOUBLON: document déjà déposé le %', to_char((v_dbl->>'depose_le')::timestamptz,'DD/MM/YYYY') USING ERRCODE='P0001'; END IF;
  INSERT INTO materiaux_documents(chemin,nom_fichier,type_mime,empreinte,fournisseur_id,fournisseur_libre,type_document,numero,date_document,
      valide_jusquau,reference_projet,lignes_ecartees,nb_lignes,depose_par)
  VALUES (_doc->>'chemin', left(coalesce(NULLIF(trim(_doc->>'nom_fichier'),''),'document'),200), coalesce(_doc->>'type_mime','application/pdf'),
      _doc->>'empreinte', v_f, v_libre, v_type, v_num, v_date, NULLIF(_doc->>'valide_jusquau','')::date,
      left(NULLIF(trim(_doc->>'reference_projet'),''),300), coalesce(_doc->'lignes_ecartees','[]'::jsonb), jsonb_array_length(_lignes), auth.uid())
  RETURNING id INTO v_id;
  v_src := 'document_fournisseur';
  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    IF coalesce(trim(l->>'produit'),'')='' THEN RAISE EXCEPTION 'Ligne % : désignation manquante', i+1; END IF;
    IF coalesce(NULLIF(l->>'prix','')::numeric,0) <= 0 THEN RAISE EXCEPTION 'Ligne % : prix manquant ou nul', i+1; END IF;
    INSERT INTO materiaux_catalogue(fournisseur_id,fournisseur_libre,produit,ref,unite,format_texte,longueur_mm,largeur_mm,epaisseur_mm,
        prix_achat_net,date_tarif,source,remarque,actif,proposition_statut,propose_par,propose_le,document_origine_id,document_ligne)
    VALUES (v_f, v_libre, left(trim(l->>'produit'),300), NULLIF(trim(l->>'ref'),''), coalesce(NULLIF(trim(l->>'unite'),''),'unité'),
        NULLIF(trim(l->>'format_texte'),''), NULLIF(l->>'longueur_mm','')::numeric, NULLIF(l->>'largeur_mm','')::numeric,
        NULLIF(l->>'epaisseur_mm','')::numeric, (l->>'prix')::numeric, coalesce(v_date, current_date), v_src,
        NULLIF(trim(l->>'remarque'),''), false, 'propose', auth.uid(), now(), v_id, i);
    i := i + 1; n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('document_id',v_id,'propositions',n);
END $function$;

CREATE OR REPLACE FUNCTION public.materiaux_documents_lister(_limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT materiaux_document_peut_deposer() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('total',(SELECT count(*) FROM materiaux_documents),
    'lignes',coalesce((SELECT jsonb_agg(x ORDER BY (x->>'depose_le') DESC) FROM (
      SELECT jsonb_build_object('id',d.id,'nom_fichier',d.nom_fichier,'fournisseur',coalesce(f.nom,d.fournisseur_libre),
        'fournisseur_libre',d.fournisseur_id IS NULL,'type_document',d.type_document,'numero',d.numero,'date_document',d.date_document,
        'valide_jusquau',d.valide_jusquau,'reference_projet',d.reference_projet,'nb_lignes',d.nb_lignes,
        'nb_ecartees',jsonb_array_length(d.lignes_ecartees),'lignes_ecartees',d.lignes_ecartees,
        'depose_par',p.full_name,'depose_le',d.depose_le,
        'en_attente',(SELECT count(*) FROM materiaux_catalogue c WHERE c.document_origine_id=d.id AND c.proposition_statut='propose'),
        'valides',(SELECT count(*) FROM materiaux_catalogue c WHERE c.document_origine_id=d.id AND c.proposition_statut='valide'),
        'refuses',(SELECT count(*) FROM materiaux_catalogue c WHERE c.document_origine_id=d.id AND c.proposition_statut='refuse')) x
      FROM materiaux_documents d LEFT JOIN fournisseurs_tarifs f ON f.id=d.fournisseur_id LEFT JOIN profiles p ON p.id=d.depose_par
      ORDER BY d.depose_le DESC LIMIT greatest(1,least(_limit,200)) OFFSET greatest(_offset,0)) s(x)),'[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.materiaux_document_chemin(_id uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (is_admin() OR current_user_has_capability('devis.couts')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN (SELECT chemin FROM materiaux_documents WHERE id=_id);
END $function$;

CREATE OR REPLACE FUNCTION public.materiau_proposition_valider(_id uuid, _p jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c record; v_f uuid; v_nom text; v_slug text; v_old uuid; v_mode text := _p->>'mode';
        v_tp text := coalesce(NULLIF(_p->>'type_prix',''),'reference'); v_fin date := NULLIF(_p->>'valide_jusquau','')::date;
BEGIN
  PERFORM mcp_assert_legacy_oauth_write('devis');
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM materiaux_catalogue WHERE id=_id AND proposition_statut='propose' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable ou déjà traitée'; END IF;
  IF v_tp NOT IN ('reference','ponctuel') THEN RAISE EXCEPTION 'Type de prix invalide'; END IF;
  IF v_tp='ponctuel' THEN
    IF v_fin IS NULL THEN RAISE EXCEPTION 'Indiquez la date de fin de validité du prix ponctuel'; END IF;
    IF v_fin < current_date THEN RAISE EXCEPTION 'La date de fin de validité est déjà passée'; END IF;
    v_mode := 'ajouter';
  END IF;
  v_f := coalesce(NULLIF(_p->>'fournisseur_id','')::uuid, c.fournisseur_id);
  v_nom := NULLIF(trim(_p->>'nouveau_fournisseur'),'');
  IF v_nom IS NOT NULL THEN
    v_slug := trim(both '-' from regexp_replace(devis_normalize(v_nom),'[^a-z0-9]+','-','g'));
    IF v_slug = '' THEN RAISE EXCEPTION 'Nom de fournisseur invalide'; END IF;
    IF EXISTS (SELECT 1 FROM fournisseurs_tarifs WHERE slug=v_slug OR devis_normalize(nom)=devis_normalize(v_nom)) THEN
      RAISE EXCEPTION 'Ce fournisseur existe déjà : choisissez-le dans la liste';
    END IF;
    v_f := fournisseur_tarif_enregistrer(jsonb_build_object('slug',v_slug,'nom',v_nom));
  END IF;
  IF v_f IS NULL OR NOT EXISTS (SELECT 1 FROM fournisseurs_tarifs WHERE id=v_f) THEN
    RAISE EXCEPTION 'Choisissez un fournisseur avant de valider';
  END IF;
  UPDATE materiaux_catalogue SET
    fournisseur_id=v_f,
    produit=coalesce(NULLIF(trim(_p->>'produit'),''),produit),
    ref=CASE WHEN _p ? 'ref' THEN NULLIF(trim(_p->>'ref'),'') ELSE ref END,
    unite=coalesce(NULLIF(trim(_p->>'unite'),''),unite),
    famille=CASE WHEN _p ? 'famille' THEN NULLIF(trim(_p->>'famille'),'') ELSE famille END,
    format_texte=CASE WHEN _p ? 'format_texte' THEN NULLIF(trim(_p->>'format_texte'),'') ELSE format_texte END,
    longueur_mm=CASE WHEN _p ? 'longueur_mm' THEN NULLIF(_p->>'longueur_mm','')::numeric ELSE longueur_mm END,
    largeur_mm=CASE WHEN _p ? 'largeur_mm' THEN NULLIF(_p->>'largeur_mm','')::numeric ELSE largeur_mm END,
    epaisseur_mm=CASE WHEN _p ? 'epaisseur_mm' THEN NULLIF(_p->>'epaisseur_mm','')::numeric ELSE epaisseur_mm END,
    prix_achat_net=CASE WHEN _p ? 'prix_achat' THEN NULLIF(_p->>'prix_achat','')::numeric ELSE prix_achat_net END,
    date_tarif=coalesce(NULLIF(_p->>'date_tarif','')::date,date_tarif)
  WHERE id=_id RETURNING * INTO c;
  SELECT o.id INTO v_old FROM materiaux_catalogue o
   WHERE o.actif AND o.type_prix='reference' AND o.fournisseur_id=v_f AND coalesce(c.ref,'')<>'' AND o.ref=c.ref AND o.id<>_id LIMIT 1;
  IF v_old IS NOT NULL THEN
    IF v_mode IS NULL OR v_mode NOT IN ('remplacer','ajouter') THEN
      RAISE EXCEPTION 'CHOIX_REQUIS: une ligne active a déjà ce fournisseur et cette référence' USING ERRCODE='P0001';
    END IF;
    IF v_mode='remplacer' THEN
      UPDATE materiaux_catalogue SET actif=false, desactive_le=now() WHERE id=v_old;
      UPDATE materiaux_catalogue SET remplace_materiau_id=v_old WHERE id=_id;
    END IF;
  END IF;
  IF coalesce(c.prix_achat_net,0) <= 0 THEN
    RAISE EXCEPTION 'Prix d''achat manquant ou nul : saisissez un prix supérieur à 0 avant de valider';
  END IF;
  UPDATE materiaux_catalogue SET proposition_statut='valide', actif=true, decision_par=auth.uid(), decision_le=now(),
    fournisseur_libre=NULL, type_prix=v_tp, valide_jusquau=CASE WHEN v_tp='ponctuel' THEN v_fin END,
    remarque=CASE WHEN v_tp='ponctuel' THEN concat_ws(' · ', 'Prix ponctuel jusqu''au '||to_char(v_fin,'DD/MM/YYYY'), NULLIF(remarque,'')) ELSE remarque END
  WHERE id=_id;
  RETURN _id;
END $function$;

CREATE OR REPLACE FUNCTION public.materiaux_propositions_lister(_statut text DEFAULT 'propose'::text, _limit integer DEFAULT 100, _offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_couts boolean := current_user_has_capability('devis.couts');
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'total',(SELECT count(*) FROM materiaux_catalogue WHERE proposition_statut=_statut),
    'lignes',coalesce((SELECT jsonb_agg(x ORDER BY x->>'propose_le' DESC) FROM (
      SELECT jsonb_build_object(
        'id',c.id,'statut',c.proposition_statut,'fournisseur_id',c.fournisseur_id,'fournisseur',coalesce(f.nom,c.fournisseur_libre),
        'fournisseur_libre',c.fournisseur_libre,'produit',c.produit,'ref',c.ref,'unite',c.unite,'format_texte',c.format_texte,
        'longueur_mm',c.longueur_mm,'largeur_mm',c.largeur_mm,'epaisseur_mm',c.epaisseur_mm,'famille',c.famille,
        'prix_achat',CASE WHEN v_couts THEN c.prix_achat_net END,'date_tarif',c.date_tarif,
        'propose_par',p.full_name,'propose_le',c.propose_le,'devis_id',c.devis_origine_id,'devis_numero',d.numero,'affaire_id',d.affaire_id,
        'document_id',c.document_origine_id,'document_numero',doc.numero,'document_type',doc.type_document,'document_date',doc.date_document,
        'document_valide_jusquau',doc.valide_jusquau,'type_prix',c.type_prix,'valide_jusquau',c.valide_jusquau,
        'prix_actuel',CASE WHEN v_couts THEN (SELECT o.prix_achat_net FROM materiaux_catalogue o WHERE o.actif AND o.fournisseur_id=c.fournisseur_id
                    AND coalesce(c.ref,'')<>'' AND o.ref=c.ref AND o.id<>c.id AND o.type_prix='reference' ORDER BY o.date_tarif DESC NULLS LAST LIMIT 1) END,
        'decision_par',pd.full_name,'decision_le',c.decision_le,'motif_refus',c.motif_refus,'remplace_materiau_id',c.remplace_materiau_id,
        'meme_ref',(SELECT o.id FROM materiaux_catalogue o WHERE o.actif AND o.type_prix='reference' AND o.fournisseur_id=c.fournisseur_id
                    AND coalesce(c.ref,'')<>'' AND o.ref=c.ref AND o.id<>c.id LIMIT 1),
        'nb_proches_calcules_a_l_ouverture',true) x
      FROM materiaux_catalogue c
      LEFT JOIN fournisseurs_tarifs f ON f.id=c.fournisseur_id
      LEFT JOIN profiles p ON p.id=c.propose_par
      LEFT JOIN profiles pd ON pd.id=c.decision_par
      LEFT JOIN devis d ON d.id=c.devis_origine_id
      LEFT JOIN materiaux_documents doc ON doc.id=c.document_origine_id
      WHERE c.proposition_statut=_statut
      ORDER BY c.propose_le DESC, c.id LIMIT greatest(1,least(_limit,200)) OFFSET greatest(_offset,0)) s(x)),'[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.materiaux_rechercher(_q text, _familles text[] DEFAULT NULL::text[], _fournisseurs uuid[] DEFAULT NULL::uuid[], _epaisseur numeric DEFAULT NULL::numeric, _recent_seulement boolean DEFAULT false, _tri text DEFAULT 'pertinence'::text, _limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, fournisseur text, fournisseur_etat text, prix_public boolean, famille text, produit text, ref text, format_texte text, longueur_mm numeric, largeur_mm numeric, epaisseur_mm numeric, unite text, prix_achat_net numeric, prix_m2 numeric, prix_ml numeric, date_tarif date, remarque text, cle_comparaison text, moins_cher_du_groupe boolean, score real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE v_q text := materiaux_norm(_q); v_rest text; s record; w text; alts text[];
        v_whole text[] := '{}'; v_pref text[] := '{}'; v_head text[] := '{}'; v_dims text[]; v_nums numeric[]; v_n int; v_any text[] := '{}'; v_anyre text;
        v_couts boolean := current_user_has_capability('devis.couts'); v_ep numeric; v_sec numeric[];
BEGIN
  IF NOT (current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v_rest := ' '||v_q||' ';
  FOR s IN SELECT ms.terme, ms.groupe FROM materiaux_synonymes ms WHERE position(' ' in ms.terme) > 0 ORDER BY length(ms.terme) DESC LOOP
    IF position(' '||s.terme||' ' in v_rest) > 0 THEN
      v_rest := replace(v_rest, ' '||s.terme||' ', ' ');
      SELECT array_agg(replace(x.terme,'.','\.')) INTO alts FROM materiaux_synonymes x WHERE x.groupe = s.groupe;
      v_whole := v_whole || ('(^| )('||array_to_string(alts,'|')||')( |$)');
      v_head := v_head || ('^('||array_to_string(alts,'|')||')(s|x)?( |$)');
      v_pref := v_pref || coalesce('(^| )('||(SELECT string_agg(a,'|') FROM unnest(alts) a WHERE length(a) > 3)||')', '$^');
      IF (SELECT bool_and(length(a) >= 3) FROM unnest(alts) a) THEN v_any := v_any || alts; END IF;
    END IF;
  END LOOP;
  v_rest := trim(v_rest);
  v_ep := coalesce((regexp_match(v_rest, '(?:^| )(\d+(?:\.\d+)?) mm(?: |$)'))[1], (regexp_match(v_rest, '(?:^| )(?:ep|epaisseur|epais) (\d+(?:\.\d+)?)(?: |$)'))[1])::numeric;
  v_rest := trim(regexp_replace(regexp_replace(' '||v_rest||' ', ' (ep|epaisseur|epais) (?=\d)', ' ', 'g'), '(\d) mm(?= )', '\1', 'g'));
  SELECT array_agg(t) INTO v_dims FROM regexp_split_to_table(v_rest,'\s+') t WHERE t ~ '^\d+(\.\d+)?(x\d+(\.\d+)?){1,2}$';
  SELECT ARRAY[(string_to_array(d,'x'))[1]::numeric, (string_to_array(d,'x'))[2]::numeric] INTO v_sec
    FROM unnest(v_dims) d WHERE cardinality(string_to_array(d,'x')) = 2 LIMIT 1;
  SELECT array_agg(n::numeric) INTO v_nums FROM regexp_split_to_table(v_rest,'[\sx]+') n WHERE n ~ '^\d+(\.\d+)?$';
  FOR w IN SELECT t FROM regexp_split_to_table(v_rest,'\s+') t WHERE length(t) > 1 AND t !~ '^[0-9.x]+$' LOOP
    SELECT array_agg(replace(b.terme,'.','\.')) INTO alts FROM materiaux_synonymes a JOIN materiaux_synonymes b ON b.groupe = a.groupe WHERE a.terme = w;
    alts := coalesce(alts, ARRAY[replace(w,'.','\.')]);
    v_whole := v_whole || ('(^| )('||array_to_string(alts,'|')||')( |$)');
    v_head := v_head || ('^('||array_to_string(alts,'|')||')(s|x)?( |$)');
    v_pref := v_pref || coalesce('(^| )('||(SELECT string_agg(a,'|') FROM unnest(alts) a WHERE length(a) > 3)||')', '$^');
    IF (SELECT bool_and(length(a) >= 3) FROM unnest(alts) a) THEN v_any := v_any || alts; END IF;
  END LOOP;
  v_n := coalesce(cardinality(v_whole), 0);
  v_anyre := CASE WHEN v_n > 0 AND cardinality(v_any) > 0 THEN array_to_string(v_any,'|') END;

  RETURN QUERY
  WITH base AS (
    SELECT m.*, f.nom AS fnom, f.etat AS fetat, f.prix_public AS fpub,
      (SELECT count(*) FROM generate_subscripts(v_whole,1) i WHERE m.search_norm ~ v_whole[i])::int AS n_whole,
      (SELECT count(*) FROM generate_subscripts(v_whole,1) i WHERE m.search_norm ~ v_whole[i] OR m.search_norm ~ v_pref[i])::int AS n_any,
      (SELECT count(*) FROM generate_subscripts(v_whole,1) i WHERE m.produit_norm ~ v_whole[i] OR m.produit_norm ~ v_pref[i])::int AS n_prod,
      EXISTS (SELECT 1 FROM unnest(v_head) h WHERE m.produit_norm ~ h) AS tete
    FROM materiaux_catalogue m JOIN fournisseurs_tarifs f ON f.id = m.fournisseur_id
    WHERE m.actif
      AND (m.valide_jusquau IS NULL OR m.valide_jusquau >= current_date)
      AND (v_anyre IS NULL OR m.search_norm ~ v_anyre OR m.search_norm %> v_q)
      AND (_familles IS NULL OR m.famille = ANY(_familles))
      AND (_fournisseurs IS NULL OR m.fournisseur_id = ANY(_fournisseurs))
      AND (_epaisseur IS NULL OR m.epaisseur_mm = _epaisseur)
      AND (NOT coalesce(_recent_seulement,false) OR f.etat = 'ok')
      AND (v_nums IS NULL OR EXISTS (SELECT 1 FROM unnest(v_nums) n WHERE n IN (m.epaisseur_mm,m.longueur_mm,m.largeur_mm)
             OR m.search_norm ~ ('(^|[^0-9.])'||replace(trim_scale(n)::text,'.','\.')||'([^0-9.]|$)')))
  ), b2 AS (
    SELECT b.*,
      CASE WHEN v_sec IS NULL THEN NULL ELSE
        b.search_norm ~ ('(^|[^0-9.x])('||replace(trim_scale(v_sec[1])::text,'.','\.')||'x'||replace(trim_scale(v_sec[2])::text,'.','\.')||'|'
                                       ||replace(trim_scale(v_sec[2])::text,'.','\.')||'x'||replace(trim_scale(v_sec[1])::text,'.','\.')||')([^0-9.]|$)') END AS sec_ok,
      CASE WHEN v_sec IS NULL THEN NULL ELSE
        (SELECT min(least(abs(x[1]::numeric - v_sec[1]) + abs(x[2]::numeric - v_sec[2]), abs(x[1]::numeric - v_sec[2]) + abs(x[2]::numeric - v_sec[1])))
           FROM regexp_matches(b.search_norm, '(?:^|[^0-9.x])(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)', 'g') x) END AS sec_dist
    FROM base b
  ), b3 AS (
    SELECT b2.*, coalesce(bool_or(b2.sec_ok) OVER (), false) AS sec_existe,
           coalesce(bool_or(b2.epaisseur_mm = v_ep) OVER (), false) AS ep_existe FROM b2
  ), c AS (
    SELECT b.*,
      ( b.n_whole + (b.n_any - b.n_whole) * 0.6
        + b.n_prod * 0.4 + CASE WHEN b.tete THEN 0.5 ELSE 0 END
        + word_similarity(v_q, b.search_norm) * 0.5
        + coalesce((SELECT count(*) FROM unnest(v_nums) n WHERE b.epaisseur_mm = n),0) * 1.0
        + coalesce((SELECT count(*) FROM unnest(v_nums) n WHERE n IN (b.longueur_mm, b.largeur_mm)),0) * 0.5
        + coalesce((SELECT sum(
            CASE WHEN cardinality(p) = 2 THEN
              CASE WHEN b.search_norm ~ ('(^|[^0-9.x])'||p[1]||'x'||p[2]||'([^0-9.x]|$)') THEN 4
                   WHEN b.search_norm ~ ('(^|[^0-9.x])'||p[2]||'x'||p[1]||'([^0-9.x]|$)') THEN 3 ELSE 0 END
            ELSE
              CASE WHEN b.search_norm ~ ('(^|[^0-9.x])'||p[1]||'x'||p[2]||'x'||p[3]||'([^0-9.]|$)') THEN 5
                   WHEN b.epaisseur_mm = replace(p[3],'\.','.')::numeric
                        AND b.search_norm ~ ('(^|[^0-9.x])('||p[1]||'x'||p[2]||'|'||p[2]||'x'||p[1]||')([^0-9.x]|$)') THEN 5
                   WHEN p[1] = p[2] AND b.search_norm ~ '(^| )carre'
                        AND (b.epaisseur_mm = replace(p[3],'\.','.')::numeric OR b.search_norm ~ ('(^|[^0-9.x])'||p[1]||'x'||p[3]||'([^0-9.]|$)')) THEN 4.5
                   ELSE 0 END
            END)
          FROM (SELECT string_to_array(replace(d,'.','\.'),'x') p FROM unnest(v_dims) d) dd), 0)
        - CASE WHEN b.fetat = 'ancien' THEN 0.3 ELSE 0 END
        + CASE WHEN v_ep IS NOT NULL AND b.epaisseur_mm = v_ep THEN 2 ELSE 0 END
        + CASE WHEN b.sec_ok THEN 4 WHEN v_sec IS NOT NULL THEN - least(coalesce(b.sec_dist, 60), 60) * 0.05 ELSE 0 END
      )::real AS sc
    FROM b3 b
    WHERE (v_n = 0 OR b.n_any >= greatest(1, v_n - 1) OR b.search_norm %> v_q)
      AND (NOT b.sec_existe OR b.sec_ok)
      AND (v_ep IS NULL OR NOT b.ep_existe OR b.epaisseur_mm IS NULL OR b.epaisseur_mm = v_ep)
  )
  SELECT c.id,c.fnom,c.fetat,c.fpub,c.famille,c.produit,c.ref,c.format_texte,c.longueur_mm,c.largeur_mm,c.epaisseur_mm,c.unite,
    CASE WHEN v_couts THEN c.prix_achat_net END, CASE WHEN v_couts THEN c.prix_m2 END, CASE WHEN v_couts THEN c.prix_ml END,
    c.date_tarif,c.remarque,c.cle_comparaison,
    (c.cle_comparaison IS NOT NULL AND c.prix_m2 IS NOT NULL AND c.prix_m2 = min(c.prix_m2) OVER (PARTITION BY c.cle_comparaison)
       AND count(*) OVER (PARTITION BY c.cle_comparaison) > 1),
    c.sc
  FROM c
  ORDER BY CASE WHEN _tri='prix' THEN c.prix_achat_net END ASC NULLS LAST,
           CASE WHEN _tri='m2' THEN coalesce(c.prix_m2,c.prix_ml) END ASC NULLS LAST,
           c.sc DESC, c.prix_m2 ASC NULLS LAST
  LIMIT least(coalesce(_limit,50),100);
END $function$;

CREATE OR REPLACE FUNCTION public.materiaux_acces_rapides(_devis_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_c boolean := current_user_has_capability('devis.couts');
BEGIN
  IF NOT (current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
   'favoris',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT c.id,c.produit,c.format_texte,c.epaisseur_mm,c.unite,f.nom fournisseur,
        CASE WHEN v_c THEN c.prix_achat_net END prix_achat_net, CASE WHEN v_c THEN c.prix_m2 END prix_m2, c.date_tarif
        FROM materiaux_favoris fa JOIN materiaux_catalogue c ON c.id=fa.materiau_id AND c.actif AND (c.valide_jusquau IS NULL OR c.valide_jusquau >= current_date) JOIN fournisseurs_tarifs f ON f.id=c.fournisseur_id
        WHERE fa.user_id=auth.uid() ORDER BY fa.cree_le DESC LIMIT 30) x),
   'recents',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT c.id,c.produit,c.format_texte,c.epaisseur_mm,c.unite,f.nom fournisseur,
        CASE WHEN v_c THEN c.prix_achat_net END prix_achat_net, CASE WHEN v_c THEN c.prix_m2 END prix_m2, c.date_tarif
        FROM (SELECT materiau_id, max(created_at) t FROM devis_materiaux WHERE created_by=auth.uid() AND materiau_id IS NOT NULL GROUP BY materiau_id ORDER BY 2 DESC LIMIT 20) r
        JOIN materiaux_catalogue c ON c.id=r.materiau_id AND c.actif AND (c.valide_jusquau IS NULL OR c.valide_jusquau >= current_date) JOIN fournisseurs_tarifs f ON f.id=c.fournisseur_id ORDER BY r.t DESC) x),
   'ce_devis',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT DISTINCT ON (c.id) c.id,c.produit,c.format_texte,c.epaisseur_mm,c.unite,f.nom fournisseur,
        CASE WHEN v_c THEN c.prix_achat_net END prix_achat_net, CASE WHEN v_c THEN c.prix_m2 END prix_m2, c.date_tarif
        FROM devis_materiaux m JOIN devis_lignes l ON l.id=m.ligne_id AND l.devis_id=_devis_id AND l.supprime_le IS NULL
        JOIN materiaux_catalogue c ON c.id=m.materiau_id AND c.actif AND (c.valide_jusquau IS NULL OR c.valide_jusquau >= current_date) JOIN fournisseurs_tarifs f ON f.id=c.fournisseur_id WHERE m.supprime_le IS NULL) x),
   'top12',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT c.id,c.produit,c.format_texte,c.epaisseur_mm,c.unite,f.nom fournisseur,
        CASE WHEN v_c THEN c.prix_achat_net END prix_achat_net, CASE WHEN v_c THEN c.prix_m2 END prix_m2, c.date_tarif
        FROM (SELECT materiau_id, count(*) n FROM devis_materiaux WHERE materiau_id IS NOT NULL AND created_at > now()-interval '12 months' GROUP BY materiau_id ORDER BY 2 DESC LIMIT 20) r
        JOIN materiaux_catalogue c ON c.id=r.materiau_id AND c.actif AND (c.valide_jusquau IS NULL OR c.valide_jusquau >= current_date) JOIN fournisseurs_tarifs f ON f.id=c.fournisseur_id ORDER BY r.n DESC) x));
END $function$;

CREATE OR REPLACE FUNCTION public.devis_materiaux_ecarts(_devis_id uuid)
 RETURNS TABLE(devis_materiau_id uuid, nouveau_materiau_id uuid, ancien_prix numeric, nouveau_prix numeric, nouvelle_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_c boolean := current_user_has_capability('devis.couts');
BEGIN
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT m.id, c.id, CASE WHEN v_c THEN m.prix_achat END, CASE WHEN v_c THEN c.prix_achat_net END, c.date_tarif
  FROM devis_materiaux m JOIN devis_lignes l ON l.id=m.ligne_id AND l.devis_id=_devis_id AND l.supprime_le IS NULL
  JOIN materiaux_catalogue o ON o.id=m.materiau_id
  JOIN LATERAL (SELECT c2.* FROM materiaux_catalogue c2 WHERE c2.actif AND c2.type_prix = 'reference' AND c2.fournisseur_id=o.fournisseur_id
                AND (c2.id=o.id OR (o.ref IS NOT NULL AND c2.ref=o.ref)) ORDER BY (c2.id=o.id) DESC LIMIT 1) c ON true
  WHERE m.supprime_le IS NULL AND (c.prix_achat_net IS DISTINCT FROM m.prix_achat OR c.id<>m.materiau_id) AND c.prix_achat_net IS NOT NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.materiau_proposition_proches(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c record; v_q text; v_couts boolean := current_user_has_capability('devis.couts');
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM materiaux_catalogue WHERE id=_id AND proposition_statut IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable'; END IF;
  v_q := materiaux_norm(c.produit);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'fournisseur',f.nom,'produit',o.produit,'ref',o.ref,'unite',o.unite,
            'prix_achat',CASE WHEN v_couts THEN o.prix_achat_net END,'date_tarif',o.date_tarif,'source',o.source,'meme_ref',o.meme_ref,
            'type_prix',o.type_prix,'valide_jusquau',o.valide_jusquau)
            ORDER BY o.meme_ref DESC, o.sim DESC)
    FROM (SELECT * FROM (
            SELECT m.*, true meme_ref, 1::real sim FROM materiaux_catalogue m
             WHERE m.actif AND m.type_prix='reference' AND m.fournisseur_id=c.fournisseur_id AND coalesce(c.ref,'')<>'' AND m.ref=c.ref AND m.id<>c.id
            UNION ALL
            SELECT m.*, false, similarity(m.search_norm, v_q) FROM materiaux_catalogue m
             WHERE m.actif AND (m.valide_jusquau IS NULL OR m.valide_jusquau >= current_date) AND m.search_norm % v_q AND m.id<>c.id) u
          ORDER BY meme_ref DESC, sim DESC LIMIT 3) o
    LEFT JOIN fournisseurs_tarifs f ON f.id=o.fournisseur_id),'[]'::jsonb);
END $function$;

DO $g$ DECLARE s text; BEGIN
  FOREACH s IN ARRAY ARRAY['materiaux_document_peut_deposer()','materiaux_document_doublon(text,uuid,text,text)',
    'materiaux_document_rapprocher(uuid,jsonb)','materiaux_document_soumettre(jsonb,jsonb)','materiaux_documents_lister(integer,integer)',
    'materiaux_document_chemin(uuid)','materiau_proposition_valider(uuid,jsonb)','materiaux_propositions_lister(text,integer,integer)',
    'materiaux_rechercher(text,text[],uuid[],numeric,boolean,text,integer)','materiaux_acces_rapides(uuid)','devis_materiaux_ecarts(uuid)','materiau_proposition_proches(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', s);
  END LOOP;
END $g$;