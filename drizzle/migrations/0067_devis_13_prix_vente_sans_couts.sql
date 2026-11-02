-- Rédacteur sans devis.couts : prix de vente des matériaux et lignes libres calculé côté serveur,
-- sans prix d'achat ni coefficient.
CREATE OR REPLACE FUNCTION public.devis_lire(_devis_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_c boolean := current_user_has_capability('devis.couts'); d record; v jsonb;
BEGIN
  IF NOT devis_peut_lire(_devis_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO d FROM devis WHERE id=_devis_id;
  v := jsonb_build_object(
    'devis', to_jsonb(d) - CASE WHEN v_c THEN 'x' ELSE 'totaux_snapshot' END,
    'affaire', (SELECT jsonb_build_object('id',a.id,'numero',a.numero,'code_opportunite',a.code_opportunite,'nom',a.nom,'created_at',a.created_at,
        'client_id',a.client_id,'date_visite_technique',a.date_visite_technique,'date_montage',a.date_montage,
        'date_evenement_debut',a.date_evenement_debut,'date_evenement_fin',a.date_evenement_fin,'date_demontage',a.date_demontage)
        FROM affaires a WHERE a.id=d.affaire_id),
    'client', (SELECT to_jsonb(c) FROM (SELECT id,nom,siret,adresse,code_postal,ville,tva_intracom FROM clients WHERE id=d.client_id) c),
    'client_final', (SELECT jsonb_build_object('id',id,'nom',nom) FROM clients WHERE id=d.client_final_id),
    'contact', (SELECT to_jsonb(c) - 'notes' FROM client_contacts c WHERE c.id=d.contact_id),
    'modele_origine', (SELECT modele_nom FROM devis WHERE id=d.modele_origine_id),
    'lignes', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.ordre),'[]') FROM devis_lignes l WHERE l.devis_id=_devis_id AND l.supprime_le IS NULL),
    'corbeille', (SELECT coalesce(jsonb_agg(jsonb_build_object('groupe',g,'supprime_le',t,'libelles',libs) ORDER BY t DESC),'[]') FROM (
        SELECT suppression_groupe g, max(supprime_le) t, jsonb_agg(coalesce(libelle,left(texte,40),type::text)) FILTER (WHERE parent_id IS NULL OR parent_id NOT IN (SELECT id FROM devis_lignes x WHERE x.suppression_groupe=l.suppression_groupe)) libs
        FROM devis_lignes l WHERE devis_id=_devis_id AND supprime_le IS NOT NULL GROUP BY suppression_groupe) z),
    'heures', (SELECT coalesce(jsonb_agg((to_jsonb(h) - CASE WHEN v_c THEN 'x' ELSE 'cout_revient' END) || jsonb_build_object('poste_libelle',p.libelle,'metier_id',p.metier_id) ORDER BY h.ordre,h.created_at),'[]')
        FROM devis_heures h JOIN devis_lignes l ON l.id=h.ligne_id JOIN devis_postes_ref p ON p.id=h.poste_id WHERE l.devis_id=_devis_id AND h.supprime_le IS NULL),
    'materiaux', (SELECT coalesce(jsonb_agg((to_jsonb(m) - CASE WHEN v_c THEN ARRAY[]::text[] ELSE ARRAY['prix_achat','coefficient'] END)
          || jsonb_build_object('prix_vente_unitaire', coalesce(m.prix_achat,0) * m.coefficient,
                                'prix_vente', m.quantite * coalesce(m.prix_achat,0) * m.coefficient) ORDER BY m.ordre,m.created_at),'[]')
        FROM devis_materiaux m JOIN devis_lignes l ON l.id=m.ligne_id WHERE l.devis_id=_devis_id AND m.supprime_le IS NULL),
    'libres', (SELECT coalesce(jsonb_agg((to_jsonb(f) - CASE WHEN v_c THEN ARRAY[]::text[] ELSE ARRAY['prix_achat','coefficient'] END)
          || jsonb_build_object('prix_vente_unitaire', coalesce(f.prix_forfait, coalesce(f.prix_achat,0) * f.coefficient),
                                'prix_vente', f.quantite * coalesce(f.prix_forfait, coalesce(f.prix_achat,0) * f.coefficient)) ORDER BY f.ordre,f.created_at),'[]')
        FROM devis_lignes_libres f JOIN devis_lignes l ON l.id=f.ligne_id WHERE l.devis_id=_devis_id AND f.supprime_le IS NULL),
    'photos', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.ordre,p.uploaded_at),'[]') FROM devis_photos p WHERE p.devis_id=_devis_id AND p.deleted_at IS NULL),
    'calcul', devis_calculer(_devis_id),
    'droits', jsonb_build_object('couts',v_c,'ecrire',devis_peut_ecrire(_devis_id),'valider',devis_peut_valider(_devis_id),'parametres',current_user_has_capability('devis.parametres')),
    'parametres', (SELECT coalesce(jsonb_object_agg(cle,valeur),'{}') FROM v_devis_parametres_courants));
  RETURN v;
END $function$;

NOTIFY pgrst, 'reload schema';