# Devis — ajustements ProGBat (remise, saisie au montant, régularisations, options incluses) + accès au menu + tests d'acceptation

Rien n'est appliqué. Une migration (0062), puis le code, puis le test d'acceptation. Arrêt et signalement si un test échoue.

## Constats vérifiés en lecture
- Les lignes libres acceptent déjà un montant négatif (aucune contrainte, aucun contrôle dans `devis_libre_enregistrer`) : le point 3 n'a besoin que du champ heures + poste.
- Le calcul unique `devis_calculer_interne` exclut toute ligne `option` du total ; pas de remise ; heures = heures × taux, pas de montant saisi.
- `devis_marquer_envoye` reprend `totaux_snapshot.total_ht` pour le CA estimé : à passer sur le net.
- Postes et niveaux du JSON existent tous (`montage:monteur`, `cnc`, `laser`, `logistique`… niveau `standard`).
- Drapeau `devis_staffing_v1` : non global, ouvert aux rôles admin, commercial, bureau_etude, chef_chantier. Le compte smart@setup.paris a le rôle `admin` : la règle le couvre. Contrôle dans l'aperçu (connexion réelle) prévu à la mise en œuvre.
- Menu : l'entrée « Devis » existante (section Production, `/devis`) est l'ancien historique des imports ProGBat ; la nouvelle liste aura sa propre adresse `/devis-staffing` pour ne rien casser.
- Écran d'import des matériaux : **Paramètres › Devis › Matériaux, adresse `/parametres/devis-materiaux`**.

## 1. Remise globale et total net
- Devis : `remise_mode` (montant / pourcentage / net souhaité) et `remise_valeur`. La remise calculée est arrondie au centime, jamais supérieure au total HT.
- Calcul : `total_ht`, `remise` (négative à l'affichage), `net_ht`, TVA sur le net, TTC. Marge = net − coûts.
- Pied de la synthèse : un champ et un sélecteur à 3 choix ; vue client : Total HT, Remise, Total net HT, TVA, TTC (Remise masquée si 0).
- Envoi au client et montant figé à la validation : reprennent le net HT.

## 2. Saisie au montant sur une ligne d'heures
- Nouveau champ `montant_force` (facultatif). S'il est rempli, il fait foi au centime ; le taux affiché = montant ÷ heures (calcul non arrondi, affichage 2 décimales, « — » si 0 h).
- Dans l'éditeur, bascule « Taux / Montant » par ligne ; 0 h ou 0 € acceptés. L'alerte d'écart à la grille devient une simple information.
- Le coût de revient reste heures × coût grille (la marge reste juste).

## 3. Lignes de régularisation
- Montants négatifs déjà acceptés ; l'éditeur autorisera le signe « − » et affichera ces lignes en couleur d'avertissement.
- Nouveaux champs facultatifs sur la ligne libre : `heures_info` + `poste_info_id`. Comptés dans les heures par métier (sans poste : « non affecté »), multipliés par la quantité de l'objet, sans effet sur le prix.

## 4. Options incluses
- Case « Incluse dans le total » sur une ligne option (non cochée par défaut). Cochée, l'option compte dans le total HT, les heures par métier et la marge.

## 5. Validité
- Rien à changer (30 jours, saisie manuelle déjà en place).

## 6. Accès depuis le menu
- « Suivi des affaires », sous « Pipeline opportunités » :
  - **Devis** → `/devis-staffing` (droit `devis.view` + drapeau) : tableau numéro, version, affaire, client, statut, total net HT, date, chargé d'affaires ; recherche (numéro, affaire, client) ; filtres statut et chargé d'affaires ; bouton « Nouveau devis » (recherche d'opportunité, puis vierge / modèle, via `devis_creer`) visible seulement avec `devis.rediger`. Clic sur une ligne → l'éditeur existant.
  - **Paramètres devis** (admins, `devis.parametres`) → `/parametres/devis-taux`, avec des onglets Taux / Matériaux / Modèles en haut des trois écrans.
- La liste lit une nouvelle fonction qui applique les règles de lecture existantes (chef d'équipe : seulement ses affaires) et ne renvoie aucun coût.

## Test d'acceptation
- Script SQL en transaction annulée : crée une affaire fictive, charge les 3 devis du JSON selon vos règles, appelle `devis_calculer_interne`, compare total HT, remise, net, TVA, TTC à l'attendu et affiche les heures par métier. Le script est gardé dans le projet (`supabase/tests/devis_progbat_acceptation.sql`).
- Tests Vitest du calcul côté écran avec les mêmes 3 devis (mêmes chiffres attendus), pour garder le miroir écran/serveur aligné.
- Contrôles navigateur : connexion smart@, entrée « Devis » visible, liste, création, saisie au montant, remise.

## Points d'attention
- `devis_lire_client` et `devis_statut_changer` seront relus juste avant application ; si `devis_lire_client` filtre les clés de totaux ou si `devis_statut_changer` écrit `montant_ht := total_ht`, je les redéfinirai en ne changeant que ces expressions (diff montré). Sinon aucun changement.
- Les heures « Coursier 20m3 » (4 h, 2 h) n'ont pas de poste dans le JSON : elles iront dans « non affecté ».

## Détails techniques — migration 0062 (SQL complet)

```sql
-- 1. Schéma
ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS remise_mode text NOT NULL DEFAULT 'aucune'
    CHECK (remise_mode IN ('aucune','montant','pct','net_cible')),
  ADD COLUMN IF NOT EXISTS remise_valeur numeric(14,4);
ALTER TABLE public.devis_heures ADD COLUMN IF NOT EXISTS montant_force numeric(14,2);
ALTER TABLE public.devis_lignes_libres
  ADD COLUMN IF NOT EXISTS heures_info numeric(10,2),
  ADD COLUMN IF NOT EXISTS poste_info_id uuid REFERENCES public.devis_postes_ref(id);
ALTER TABLE public.devis_lignes ADD COLUMN IF NOT EXISTS option_incluse boolean NOT NULL DEFAULT false;

-- 2. Calcul unique
CREATE OR REPLACE FUNCTION public.devis_calculer_interne(_devis_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH RECURSIVE l AS (SELECT * FROM devis_lignes WHERE devis_id=_devis_id AND supprime_le IS NULL),
t AS (
  SELECT id, id AS racine, (type='option' AND NOT option_incluse) AS est_option, quantite AS q FROM l WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.racine, t.est_option OR (c.type='option' AND NOT c.option_incluse), c.quantite FROM l c JOIN t ON c.parent_id=t.id
),
hx AS (SELECT ligne_id, par_unite, coalesce(montant_force, heures*taux_vente) v, heures*cout_revient c, (cout_revient IS NULL AND heures>0) manq
       FROM devis_heures WHERE supprime_le IS NULL),
h AS (SELECT ligne_id, sum(v) FILTER (WHERE par_unite) vu, sum(v) FILTER (WHERE NOT par_unite) vl,
             sum(c) FILTER (WHERE par_unite) cu, sum(c) FILTER (WHERE NOT par_unite) cl, bool_or(manq) manq
      FROM hx GROUP BY ligne_id),
m AS (SELECT ligne_id, sum(quantite*prix_achat*coefficient) v, sum(quantite*prix_achat) c FROM devis_materiaux WHERE supprime_le IS NULL GROUP BY ligne_id),
f AS (SELECT ligne_id,
        sum(quantite*coalesce(prix_forfait,coalesce(prix_achat,0)*coefficient)) FILTER (WHERE par_unite) vu,
        sum(quantite*coalesce(prix_forfait,coalesce(prix_achat,0)*coefficient)) FILTER (WHERE NOT par_unite) vl,
        sum(quantite*coalesce(prix_achat,0)) FILTER (WHERE par_unite) cu,
        sum(quantite*coalesce(prix_achat,0)) FILTER (WHERE NOT par_unite) cl
      FROM devis_lignes_libres WHERE supprime_le IS NULL GROUP BY ligne_id),
o AS (
  SELECT t.id, t.racine, t.est_option, t.q,
    round((coalesce(h.vu,0)+coalesce(m.v,0)+coalesce(f.vu,0))*t.q + coalesce(h.vl,0)+coalesce(f.vl,0), 2) AS vente,
    (coalesce(h.cu,0)+coalesce(m.c,0)+coalesce(f.cu,0))*t.q + coalesce(h.cl,0)+coalesce(f.cl,0) AS cout,
    coalesce(h.manq,false) AS manq
  FROM t LEFT JOIN h ON h.ligne_id=t.id LEFT JOIN m ON m.ligne_id=t.id LEFT JOIN f ON f.ligne_id=t.id
),
hh AS (
  SELECT p.metier_id, x.heures*CASE WHEN x.par_unite THEN t.q ELSE 1 END h
    FROM devis_heures x JOIN t ON t.id=x.ligne_id JOIN devis_postes_ref p ON p.id=x.poste_id
   WHERE x.supprime_le IS NULL AND NOT t.est_option
  UNION ALL
  SELECT p.metier_id, x.heures_info*CASE WHEN x.par_unite THEN t.q ELSE 1 END
    FROM devis_lignes_libres x JOIN t ON t.id=x.ligne_id LEFT JOIN devis_postes_ref p ON p.id=x.poste_info_id
   WHERE x.supprime_le IS NULL AND NOT t.est_option AND coalesce(x.heures_info,0)<>0
),
hm AS (SELECT metier_id, round(sum(h),2) h FROM hh GROUP BY metier_id),
tot AS (SELECT round(coalesce(sum(vente) FILTER (WHERE NOT est_option),0),2) ht, coalesce(sum(cout) FILTER (WHERE NOT est_option),0) cout,
               coalesce(bool_or(manq) FILTER (WHERE NOT est_option),false) manq,
               coalesce(sum(vente) FILTER (WHERE est_option),0) opt FROM o),
dv AS (SELECT remise_mode, remise_valeur, tva_pct FROM devis WHERE id=_devis_id),
rem AS (SELECT LEAST(tot.ht, GREATEST(0, round(CASE coalesce(dv.remise_mode,'aucune')
          WHEN 'montant'   THEN abs(coalesce(dv.remise_valeur,0))
          WHEN 'pct'       THEN tot.ht*coalesce(dv.remise_valeur,0)/100
          WHEN 'net_cible' THEN tot.ht-coalesce(dv.remise_valeur,tot.ht)
          ELSE 0 END, 2))) r
        FROM tot LEFT JOIN dv ON true),
tva AS (SELECT coalesce((SELECT tva_pct FROM dv),(SELECT valeur FROM v_devis_parametres_courants WHERE cle='tva_pct'),20) p),
n AS (SELECT tot.ht - rem.r net FROM tot, rem)
SELECT jsonb_build_object(
  'total_ht', tot.ht,
  'remise', -rem.r,
  'net_ht', n.net,
  'tva_pct', tva.p,
  'tva', round(n.net*tva.p/100,2),
  'ttc', n.net+round(n.net*tva.p/100,2),
  'options_ht', round(tot.opt,2),
  'lignes', (SELECT coalesce(jsonb_object_agg(id, vente),'{}'::jsonb) FROM o WHERE vente<>0),
  'racines', (SELECT coalesce(jsonb_object_agg(racine, s),'{}'::jsonb) FROM (SELECT racine, round(sum(vente),2) s FROM o GROUP BY racine) z),
  'heures_metier', (SELECT coalesce(jsonb_object_agg(coalesce(metier_id::text,'aucun'), h),'{}'::jsonb) FROM hm),
  'cout_total', CASE WHEN tot.manq THEN NULL ELSE round(tot.cout,2) END,
  'marge', CASE WHEN tot.manq THEN to_jsonb('non_calculable'::text) ELSE to_jsonb(round(n.net-tot.cout,2)) END)
FROM tot, rem, tva, n;
$function$;

-- 3. Ligne d'heures : montant saisi (redéfinition depuis la version actuelle, seul ajout : montant_force)
CREATE OR REPLACE FUNCTION public.devis_heure_enregistrer(_ligne_id uuid, _h jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_id uuid := NULLIF(_h->>'id','')::uuid; v_old devis_heures%ROWTYPE;
        v_poste uuid; v_niveau text; g record; v_regrille boolean;
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF v_id IS NOT NULL THEN SELECT * INTO v_old FROM devis_heures WHERE id=v_id AND ligne_id=_ligne_id; IF NOT FOUND THEN RAISE EXCEPTION 'Ligne d''heures introuvable'; END IF; END IF;
  v_poste := coalesce(NULLIF(_h->>'poste_id','')::uuid, v_old.poste_id);
  IF v_poste IS NULL THEN RAISE EXCEPTION 'Poste obligatoire'; END IF;
  v_niveau := coalesce(NULLIF(_h->>'niveau',''), CASE WHEN NULLIF(_h->>'poste_id','')::uuid IS DISTINCT FROM v_old.poste_id AND v_id IS NOT NULL THEN NULL ELSE v_old.niveau END,
     (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste AND par_defaut LIMIT 1),
     (SELECT niveau FROM v_devis_taux_courants WHERE poste_id=v_poste ORDER BY niveau LIMIT 1), 'standard');
  SELECT taux_vente, cout_revient INTO g FROM v_devis_taux_courants WHERE poste_id=v_poste AND niveau=v_niveau;
  v_regrille := v_id IS NULL OR v_poste<>v_old.poste_id OR v_niveau<>v_old.niveau;
  IF v_id IS NULL THEN
    INSERT INTO devis_heures(ligne_id,poste_id,niveau,heures,par_unite,taux_vente,taux_grille,cout_revient,ordre,montant_force)
    VALUES(_ligne_id,v_poste,v_niveau,coalesce((_h->>'heures')::numeric,0),coalesce((_h->>'par_unite')::boolean,true),
      coalesce((_h->>'taux_vente')::numeric,g.taux_vente,0),g.taux_vente,g.cout_revient,
      coalesce((_h->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_heures WHERE ligne_id=_ligne_id)),
      round((_h->>'montant_force')::numeric,2))
    RETURNING id INTO v_id;
  ELSE
    UPDATE devis_heures SET poste_id=v_poste, niveau=v_niveau,
      heures = CASE WHEN _h ? 'heures' THEN coalesce((_h->>'heures')::numeric,0) ELSE heures END,
      par_unite = CASE WHEN _h ? 'par_unite' THEN coalesce((_h->>'par_unite')::boolean,true) ELSE par_unite END,
      taux_grille = CASE WHEN v_regrille THEN g.taux_vente ELSE taux_grille END,
      cout_revient = CASE WHEN v_regrille THEN g.cout_revient ELSE cout_revient END,
      taux_vente = CASE WHEN _h ? 'taux_vente' THEN coalesce((_h->>'taux_vente')::numeric,0)
                        WHEN v_regrille THEN coalesce(g.taux_vente,0) ELSE taux_vente END,
      montant_force = CASE WHEN _h ? 'montant_force' THEN round((_h->>'montant_force')::numeric,2) ELSE montant_force END,
      ordre = CASE WHEN _h ? 'ordre' THEN (_h->>'ordre')::numeric ELSE ordre END
    WHERE id=v_id;
  END IF;
  RETURN v_id;
END $function$;

-- 4. Ligne libre : heures facultatives + poste (redéfinition, seuls ajouts : heures_info, poste_info_id)
CREATE OR REPLACE FUNCTION public.devis_libre_enregistrer(_ligne_id uuid, _f jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_d uuid := devis_de_ligne(_ligne_id); v_id uuid := NULLIF(_f->>'id','')::uuid; v_fk text := NULLIF(_f->>'forfait_cle','');
BEGIN
  PERFORM devis_assert_ecriture(v_d);
  IF v_id IS NULL THEN
    INSERT INTO devis_lignes_libres(ligne_id,categorie,forfait_cle,designation,unite,quantite,prix_achat,prix_forfait,coefficient,par_unite,ordre,heures_info,poste_info_id)
    VALUES(_ligne_id, coalesce(NULLIF(_f->>'categorie',''), CASE WHEN v_fk IS NOT NULL THEN 'forfait' ELSE 'achat' END), v_fk,
      coalesce(NULLIF(_f->>'designation',''),'Ligne libre'), _f->>'unite', coalesce((_f->>'quantite')::numeric,1), (_f->>'prix_achat')::numeric,
      coalesce((_f->>'prix_forfait')::numeric, CASE WHEN v_fk IS NOT NULL THEN (SELECT valeur FROM v_devis_parametres_courants WHERE cle=v_fk) END),
      coalesce((_f->>'coefficient')::numeric,1), coalesce((_f->>'par_unite')::boolean,true),
      coalesce((_f->>'ordre')::numeric,(SELECT coalesce(max(ordre),0)+1 FROM devis_lignes_libres WHERE ligne_id=_ligne_id)),
      (_f->>'heures_info')::numeric, NULLIF(_f->>'poste_info_id','')::uuid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE devis_lignes_libres SET
      categorie = CASE WHEN _f ? 'categorie' THEN _f->>'categorie' ELSE categorie END,
      designation = CASE WHEN _f ? 'designation' THEN _f->>'designation' ELSE designation END,
      unite = CASE WHEN _f ? 'unite' THEN _f->>'unite' ELSE unite END,
      quantite = CASE WHEN _f ? 'quantite' THEN coalesce((_f->>'quantite')::numeric,0) ELSE quantite END,
      prix_achat = CASE WHEN _f ? 'prix_achat' THEN (_f->>'prix_achat')::numeric ELSE prix_achat END,
      prix_forfait = CASE WHEN _f ? 'prix_forfait' THEN (_f->>'prix_forfait')::numeric ELSE prix_forfait END,
      coefficient = CASE WHEN _f ? 'coefficient' THEN coalesce((_f->>'coefficient')::numeric,1) ELSE coefficient END,
      par_unite = CASE WHEN _f ? 'par_unite' THEN coalesce((_f->>'par_unite')::boolean,true) ELSE par_unite END,
      ordre = CASE WHEN _f ? 'ordre' THEN (_f->>'ordre')::numeric ELSE ordre END,
      heures_info = CASE WHEN _f ? 'heures_info' THEN (_f->>'heures_info')::numeric ELSE heures_info END,
      poste_info_id = CASE WHEN _f ? 'poste_info_id' THEN NULLIF(_f->>'poste_info_id','')::uuid ELSE poste_info_id END
    WHERE id=v_id AND ligne_id=_ligne_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ligne libre introuvable'; END IF;
  END IF;
  RETURN v_id;
END $function$;

-- 5. Remise et option incluse (nouvelles fonctions, mêmes contrôles d'écriture)
CREATE OR REPLACE FUNCTION public.devis_remise_modifier(_devis_id uuid, _mode text, _valeur numeric)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM devis_assert_ecriture(_devis_id);
  IF _mode NOT IN ('aucune','montant','pct','net_cible') THEN RAISE EXCEPTION 'Mode de remise invalide'; END IF;
  IF _mode='pct' AND (_valeur < 0 OR _valeur > 100) THEN RAISE EXCEPTION 'Pourcentage entre 0 et 100'; END IF;
  IF _mode IN ('montant','net_cible') AND _valeur < 0 THEN RAISE EXCEPTION 'Montant positif attendu'; END IF;
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET remise_mode=_mode, remise_valeur=CASE WHEN _mode='aucune' THEN NULL ELSE _valeur END, updated_at=now() WHERE id=_devis_id;
  RETURN devis_calculer(_devis_id);
END $function$;

CREATE OR REPLACE FUNCTION public.devis_option_inclure(_ligne_id uuid, _incluse boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM devis_assert_ecriture(devis_de_ligne(_ligne_id));
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis_lignes SET option_incluse=coalesce(_incluse,false), updated_at=now() WHERE id=_ligne_id AND type='option';
  IF NOT FOUND THEN RAISE EXCEPTION 'Ligne option introuvable'; END IF;
END $function$;

-- 6. Envoi : CA estimé = net HT (seul changement : v_ht)
CREATE OR REPLACE FUNCTION public.devis_marquer_envoye(_devis_id uuid, _date date DEFAULT CURRENT_DATE)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d record; v_ht numeric; v_avance boolean := false;
BEGIN
  IF auth.jwt()->>'client_id' IS NOT NULL THEN RAISE EXCEPTION 'Envoi réservé à l''application' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id AND redige_dans_staffing AND NOT est_modele FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devis introuvable'; END IF;
  IF NOT devis_peut_valider(_devis_id) THEN RAISE EXCEPTION 'Envoi réservé au chargé d''affaires de l''affaire ou à un admin' USING ERRCODE='42501'; END IF;
  IF d.statut_redaction <> 'valide' THEN RAISE EXCEPTION 'Seul un devis validé peut être envoyé'; END IF;
  IF _date IS NULL OR _date > current_date + 1 THEN RAISE EXCEPTION 'Date d''envoi invalide'; END IF;
  v_ht := coalesce((d.totaux_snapshot->>'net_ht')::numeric, (d.totaux_snapshot->>'total_ht')::numeric, d.montant_ht);
  PERFORM set_config('app.devis_rpc','on',true);
  UPDATE devis SET statut_redaction='transfere', date_envoi=_date, updated_at=now() WHERE id=_devis_id;
  IF EXISTS (SELECT 1 FROM affaires WHERE id=d.affaire_id AND phase='opportunite') THEN
    v_avance := devis_opp_avancer(d.affaire_id,'envoye',
      format('Devis %s (R%s) envoyé le %s — %s € net HT', d.numero, d.version, to_char(_date,'DD/MM/YYYY'), to_char(v_ht,'FM999G999G990D00')));
    UPDATE affaires SET ca_estime_ht=v_ht, updated_at=now() WHERE id=d.affaire_id;
    INSERT INTO opportunite_jalons(affaire_id,etape,date_atteinte,ordre) VALUES(d.affaire_id,'devis_envoye',_date,2)
      ON CONFLICT (affaire_id,etape) DO UPDATE SET date_atteinte=EXCLUDED.date_atteinte, updated_at=now();
  END IF;
  RETURN jsonb_build_object('devis_id',_devis_id,'statut_avance',v_avance,'ca_estime_ht',v_ht);
END $function$;

-- 7. Liste globale (lecture, sans coûts, règles de lecture existantes)
CREATE OR REPLACE FUNCTION public.devis_lister_global(_recherche text DEFAULT NULL, _statuts text[] DEFAULT NULL,
  _charge_affaires_id uuid DEFAULT NULL, _limit int DEFAULT 200, _offset int DEFAULT 0)
 RETURNS TABLE(id uuid, numero text, version int, statut_redaction devis_redaction_statut, affaire_id uuid, affaire_numero text,
   affaire_nom text, client_nom text, net_ht numeric, date_devis date, charge_affaires_id uuid, charge_affaires_nom text, updated_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT d.id, d.numero, d.version, d.statut_redaction, a.id, a.numero::text, a.nom, c.nom,
         coalesce((d.totaux_snapshot->>'net_ht')::numeric, (devis_calculer_interne(d.id)->>'net_ht')::numeric),
         d.date_devis, r.employe_id, trim(coalesce(e.prenom,'')||' '||coalesce(e.nom,'')), d.updated_at
    FROM devis d
    JOIN affaires a ON a.id=d.affaire_id
    LEFT JOIN clients c ON c.id=d.client_id
    LEFT JOIN affaire_roles r ON r.affaire_id=a.id AND r.role='charge_affaires'
    LEFT JOIN employes e ON e.id=r.employe_id
   WHERE d.redige_dans_staffing AND NOT d.est_modele
     AND current_user_has_capability('devis.view') AND devis_peut_lire(d.id)
     AND (_statuts IS NULL OR d.statut_redaction::text = ANY(_statuts))
     AND (_charge_affaires_id IS NULL OR r.employe_id=_charge_affaires_id)
     AND (_recherche IS NULL OR concat_ws(' ',d.numero,a.numero,a.nom,c.nom) ILIKE '%'||_recherche||'%')
   ORDER BY d.updated_at DESC, d.id
   LIMIT LEAST(coalesce(_limit,200),500) OFFSET coalesce(_offset,0);
$function$;

REVOKE ALL ON FUNCTION public.devis_lister_global(text,text[],uuid,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_lister_global(text,text[],uuid,int,int) TO authenticated;
REVOKE ALL ON FUNCTION public.devis_remise_modifier(uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_remise_modifier(uuid,text,numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.devis_option_inclure(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_option_inclure(uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
```

Noms exacts de colonnes à confirmer à l'écriture : `affaire_roles.role` / `employe_id`, `clients.nom`, `employes.prenom/nom`, existence de `devis_calculer` (lecteur public). Si un nom diffère, seule la référence est ajustée.

## Détails techniques — code
- `src/lib/devis/calcul.ts` : même règle (montant saisi, heures des lignes libres, option incluse, remise, net) + tests des 3 devis.
- Éditeur : bascule Taux/Montant, champs heures/poste sur ligne libre, case « Incluse » sur option, bloc Remise dans la synthèse ; vue client avec les lignes Remise et Net.
- `AppSidebar.tsx` : 2 entrées ; nouvelle page `src/routes/_app.devis-staffing.index.tsx` ; onglets Taux / Matériaux / Modèles.
- Règle ajoutée à AGENTS.md : le total facturé est le net HT (après remise), source unique pour CA estimé et montant figé.
