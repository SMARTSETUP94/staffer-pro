CREATE OR REPLACE FUNCTION public.materiaux_rechercher(_q text, _familles text[] DEFAULT NULL::text[], _fournisseurs uuid[] DEFAULT NULL::uuid[], _epaisseur numeric DEFAULT NULL::numeric, _recent_seulement boolean DEFAULT false, _tri text DEFAULT 'pertinence'::text, _limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, fournisseur text, fournisseur_etat text, prix_public boolean, famille text, produit text, ref text, format_texte text, longueur_mm numeric, largeur_mm numeric, epaisseur_mm numeric, unite text, prix_achat_net numeric, prix_m2 numeric, prix_ml numeric, date_tarif date, remarque text, cle_comparaison text, moins_cher_du_groupe boolean, score real)
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_q text := materiaux_norm(_q); v_rest text; s record; w text; alts text[];
        v_whole text[] := '{}'; v_pref text[] := '{}'; v_head text[] := '{}'; v_dims text[]; v_nums numeric[]; v_n int; v_any text[] := '{}'; v_anyre text;
        v_couts boolean := current_user_has_capability('devis.couts');
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
      v_any := v_any || alts;
    END IF;
  END LOOP;
  v_rest := trim(v_rest);
  SELECT array_agg(t) INTO v_dims FROM regexp_split_to_table(v_rest,'\s+') t WHERE t ~ '^\d+(\.\d+)?(x\d+(\.\d+)?){1,2}$';
  SELECT array_agg(n::numeric) INTO v_nums FROM regexp_split_to_table(v_rest,'[\sx]+') n WHERE n ~ '^\d+(\.\d+)?$';
  FOR w IN SELECT t FROM regexp_split_to_table(v_rest,'\s+') t WHERE length(t) > 1 AND t !~ '^[0-9.x]+$' LOOP
    SELECT array_agg(replace(b.terme,'.','\.')) INTO alts FROM materiaux_synonymes a JOIN materiaux_synonymes b ON b.groupe = a.groupe WHERE a.terme = w;
    alts := coalesce(alts, ARRAY[replace(w,'.','\.')]);
    v_whole := v_whole || ('(^| )('||array_to_string(alts,'|')||')( |$)');
    v_head := v_head || ('^('||array_to_string(alts,'|')||')(s|x)?( |$)');
    v_pref := v_pref || coalesce('(^| )('||(SELECT string_agg(a,'|') FROM unnest(alts) a WHERE length(a) > 3)||')', '$^');
    v_any := v_any || alts;
  END LOOP;
  v_n := coalesce(cardinality(v_whole), 0);
  -- préfiltre indexé (trigrammes) : au moins un des termes, ou ressemblance globale
  v_anyre := CASE WHEN v_n > 0 THEN array_to_string(v_any,'|') END;

  RETURN QUERY
  WITH base AS (
    SELECT m.*, f.nom AS fnom, f.etat AS fetat, f.prix_public AS fpub,
      (SELECT count(*) FROM generate_subscripts(v_whole,1) i WHERE m.search_norm ~ v_whole[i])::int AS n_whole,
      (SELECT count(*) FROM generate_subscripts(v_whole,1) i WHERE m.search_norm ~ v_whole[i] OR m.search_norm ~ v_pref[i])::int AS n_any,
      (SELECT count(*) FROM generate_subscripts(v_whole,1) i WHERE m.produit_norm ~ v_whole[i] OR m.produit_norm ~ v_pref[i])::int AS n_prod,
      EXISTS (SELECT 1 FROM unnest(v_head) h WHERE m.produit_norm ~ h) AS tete
    FROM materiaux_catalogue m JOIN fournisseurs_tarifs f ON f.id = m.fournisseur_id
    WHERE m.actif
      AND (v_anyre IS NULL OR m.search_norm ~ v_anyre OR m.search_norm %> v_q)
      AND (_familles IS NULL OR m.famille = ANY(_familles))
      AND (_fournisseurs IS NULL OR m.fournisseur_id = ANY(_fournisseurs))
      AND (_epaisseur IS NULL OR m.epaisseur_mm = _epaisseur)
      AND (NOT coalesce(_recent_seulement,false) OR f.etat = 'ok')
      AND (v_nums IS NULL OR EXISTS (SELECT 1 FROM unnest(v_nums) n WHERE n IN (m.epaisseur_mm,m.longueur_mm,m.largeur_mm)
             OR m.search_norm ~ ('(^|[^0-9.])'||replace(trim_scale(n)::text,'.','\.')||'([^0-9.]|$)')))
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