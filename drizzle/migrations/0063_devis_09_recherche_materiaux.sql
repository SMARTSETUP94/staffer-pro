-- Normalisation dédiée à la recherche matériaux : × * x unifiés, virgule décimale, Ø, séparation lettres/chiffres.
CREATE OR REPLACE FUNCTION public.materiaux_norm(t text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public', 'extensions'
AS $$
  SELECT trim(regexp_replace(regexp_replace(replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      lower(extensions.unaccent(replace(replace(replace(replace(coalesce(t,''),'×','x'),'*','x'),'Ø',' diam '),'ø',' diam '))),
      '(\d),(\d)', '\1.\2', 'g'),
      '(\d)\s*x\s*(?=\d)', '\1§', 'g'),
      '([a-z]{2,})(\d)', '\1 \2', 'g'),
      '(\d)([a-wyz])', '\1 \2', 'g'),
    '§', 'x'),
    '(?<![0-9])\.|\.(?![0-9])|[^a-z0-9. ]+', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

ALTER TABLE public.materiaux_catalogue ADD COLUMN IF NOT EXISTS search_norm text;

CREATE OR REPLACE FUNCTION public.materiaux_set_search_text()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_src text;
BEGIN
  v_src := concat_ws(' ',NEW.famille,NEW.produit,NEW.ref,NEW.format_texte,NEW.caracteristiques,
       CASE WHEN NEW.epaisseur_mm IS NOT NULL THEN trim_scale(NEW.epaisseur_mm)::text END,
       CASE WHEN NEW.longueur_mm IS NOT NULL THEN trim_scale(NEW.longueur_mm)::text||'x'||coalesce(trim_scale(NEW.largeur_mm)::text,'') END);
  NEW.search_text := devis_normalize(v_src);
  NEW.search_norm := materiaux_norm(v_src);
  RETURN NEW;
END $function$;

-- Remplissage de la nouvelle colonne (dérivée, n'altère aucune donnée existante).
UPDATE public.materiaux_catalogue SET search_norm = materiaux_norm(concat_ws(' ',famille,produit,ref,format_texte,caracteristiques,
       CASE WHEN epaisseur_mm IS NOT NULL THEN trim_scale(epaisseur_mm)::text END,
       CASE WHEN longueur_mm IS NOT NULL THEN trim_scale(longueur_mm)::text||'x'||coalesce(trim_scale(largeur_mm)::text,'') END))
 WHERE search_norm IS NULL;

CREATE INDEX IF NOT EXISTS materiaux_search_norm_trgm ON public.materiaux_catalogue USING gin (search_norm gin_trgm_ops) WHERE actif;

-- Synonymes modifiables par l'admin (un groupe = termes équivalents).
CREATE TABLE IF NOT EXISTS public.materiaux_synonymes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  groupe text NOT NULL,
  terme text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materiaux_synonymes_terme_uniq UNIQUE (terme)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiaux_synonymes TO authenticated;
GRANT ALL ON public.materiaux_synonymes TO service_role;
ALTER TABLE public.materiaux_synonymes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Synonymes lisibles" ON public.materiaux_synonymes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Synonymes gérés par paramètres devis" ON public.materiaux_synonymes FOR ALL TO authenticated
  USING (current_user_has_capability('devis.parametres')) WITH CHECK (current_user_has_capability('devis.parametres'));

CREATE OR REPLACE FUNCTION public.materiaux_synonymes_norm()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.terme := materiaux_norm(NEW.terme);
  NEW.groupe := materiaux_norm(NEW.groupe);
  IF NEW.terme = '' OR NEW.groupe = '' THEN RAISE EXCEPTION 'Terme et groupe obligatoires'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_materiaux_synonymes_norm BEFORE INSERT OR UPDATE ON public.materiaux_synonymes
  FOR EACH ROW EXECUTE FUNCTION materiaux_synonymes_norm();

-- Recherche : mots entiers ou débuts de mots (≤3 lettres : mot entier), synonymes, sections AxB / AxBxC, pénalité tarif ancien.
CREATE OR REPLACE FUNCTION public.materiaux_rechercher(_q text, _familles text[] DEFAULT NULL::text[], _fournisseurs uuid[] DEFAULT NULL::uuid[], _epaisseur numeric DEFAULT NULL::numeric, _recent_seulement boolean DEFAULT false, _tri text DEFAULT 'pertinence'::text, _limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, fournisseur text, fournisseur_etat text, prix_public boolean, famille text, produit text, ref text, format_texte text, longueur_mm numeric, largeur_mm numeric, epaisseur_mm numeric, unite text, prix_achat_net numeric, prix_m2 numeric, prix_ml numeric, date_tarif date, remarque text, cle_comparaison text, moins_cher_du_groupe boolean, score real)
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_q text := materiaux_norm(_q); v_rest text; s record; w text; alts text[];
        v_whole text[] := '{}'; v_pref text[] := '{}'; v_dims text[]; v_nums numeric[]; v_n int;
        v_couts boolean := current_user_has_capability('devis.couts');
BEGIN
  IF NOT (current_user_has_capability('devis.rediger') OR current_user_has_capability('devis.parametres')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v_rest := ' '||v_q||' ';
  -- synonymes en plusieurs mots d'abord (les plus longs en premier)
  FOR s IN SELECT ms.terme, ms.groupe FROM materiaux_synonymes ms WHERE position(' ' in ms.terme) > 0 ORDER BY length(ms.terme) DESC LOOP
    IF position(' '||s.terme||' ' in v_rest) > 0 THEN
      v_rest := replace(v_rest, ' '||s.terme||' ', ' ');
      SELECT array_agg(replace(x.terme,'.','\.')) INTO alts FROM materiaux_synonymes x WHERE x.groupe = s.groupe;
      v_whole := v_whole || ('(^| )('||array_to_string(alts,'|')||')( |$)');
      v_pref := v_pref || coalesce('(^| )('||(SELECT string_agg(a,'|') FROM unnest(alts) a WHERE length(a) > 3)||')', '$^');
    END IF;
  END LOOP;
  v_rest := trim(v_rest);
  SELECT array_agg(t) INTO v_dims FROM regexp_split_to_table(v_rest,'\s+') t WHERE t ~ '^\d+(\.\d+)?(x\d+(\.\d+)?){1,2}$';
  SELECT array_agg(n::numeric) INTO v_nums FROM regexp_split_to_table(v_rest,'[\sx]+') n WHERE n ~ '^\d+(\.\d+)?$';
  FOR w IN SELECT t FROM regexp_split_to_table(v_rest,'\s+') t WHERE length(t) > 1 AND t !~ '^[0-9.x]+$' LOOP
    SELECT array_agg(replace(b.terme,'.','\.')) INTO alts FROM materiaux_synonymes a JOIN materiaux_synonymes b ON b.groupe = a.groupe WHERE a.terme = w;
    alts := coalesce(alts, ARRAY[replace(w,'.','\.')]);
    v_whole := v_whole || ('(^| )('||array_to_string(alts,'|')||')( |$)');
    v_pref := v_pref || coalesce('(^| )('||(SELECT string_agg(a,'|') FROM unnest(alts) a WHERE length(a) > 3)||')', '$^');
  END LOOP;
  v_n := coalesce(cardinality(v_whole), 0);

  RETURN QUERY
  WITH base AS (
    SELECT m.*, f.nom AS fnom, f.etat AS fetat, f.prix_public AS fpub,
      (SELECT count(*) FROM generate_subscripts(v_whole,1) i WHERE m.search_norm ~ v_whole[i])::int AS n_whole,
      (SELECT count(*) FROM generate_subscripts(v_whole,1) i WHERE m.search_norm ~ v_whole[i] OR m.search_norm ~ v_pref[i])::int AS n_any
    FROM materiaux_catalogue m JOIN fournisseurs_tarifs f ON f.id = m.fournisseur_id
    WHERE m.actif
      AND (_familles IS NULL OR m.famille = ANY(_familles))
      AND (_fournisseurs IS NULL OR m.fournisseur_id = ANY(_fournisseurs))
      AND (_epaisseur IS NULL OR m.epaisseur_mm = _epaisseur)
      AND (NOT coalesce(_recent_seulement,false) OR f.etat = 'ok')
      AND (v_nums IS NULL OR EXISTS (SELECT 1 FROM unnest(v_nums) n WHERE n IN (m.epaisseur_mm,m.longueur_mm,m.largeur_mm)
             OR m.search_norm ~ ('(^|[^0-9.])'||replace(trim_scale(n)::text,'.','\.')||'([^0-9.]|$)')))
  ), c AS (
    SELECT b.*,
      ( b.n_whole + (b.n_any - b.n_whole) * 0.6
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
      )::real AS sc
    FROM base b
    WHERE v_n = 0 OR b.n_any >= greatest(1, v_n - 1) OR b.search_norm %> v_q
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

NOTIFY pgrst, 'reload schema';