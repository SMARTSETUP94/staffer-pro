CREATE OR REPLACE FUNCTION public.list_opportunites_active()
 RETURNS TABLE(id uuid, numero text, nom text, client text, charge_affaires_id uuid, taille opportunite_taille, statut_opportunite opportunite_statut, date_opportunite date, date_pat date, date_visite_technique date, date_montage date, date_demontage date, notes text, typologie_future text, next_action_due_le date, next_action_text text, last_jalon_etape text, last_jalon_date_atteinte date, actions_count integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
SELECT a.id,a.numero,a.nom,a.client,a.charge_affaires_id,a.taille,a.statut_opportunite,a.date_opportunite,a.date_pat,a.date_visite_technique,a.date_montage,a.date_demontage,a.notes,a.typologie_future,na.prochaine_action_due_le,na.texte,lj.etape::text,lj.date_atteinte,coalesce(ac.cnt,0)::int
FROM affaires a
LEFT JOIN LATERAL (SELECT oa.prochaine_action_due_le,oa.texte FROM opportunite_actions oa WHERE oa.affaire_id=a.id AND oa.prochaine_action_due_le IS NOT NULL AND oa.prochaine_action_close_le IS NULL ORDER BY oa.created_at DESC LIMIT 1) na ON true
LEFT JOIN LATERAL (SELECT oj.etape,oj.date_atteinte FROM opportunite_jalons oj WHERE oj.affaire_id=a.id AND oj.date_atteinte IS NOT NULL ORDER BY oj.date_atteinte DESC LIMIT 1) lj ON true
LEFT JOIN LATERAL (SELECT count(*) cnt FROM opportunite_actions oa2 WHERE oa2.affaire_id=a.id) ac ON true
WHERE a.phase='opportunite' AND a.archived_at IS NULL AND a.statut_opportunite IN ('a_faire','envoye','a_l_etude','presque_gagne','gagne','perdu') ORDER BY a.date_opportunite DESC NULLS LAST,a.created_at DESC $function$;

CREATE OR REPLACE FUNCTION public.list_opportunites_closes()
 RETURNS TABLE(id uuid, numero text, nom text, client text, charge_affaires_id uuid, statut_opportunite opportunite_statut, date_opportunite date, date_montage date, statut_change_le timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
SELECT a.id,a.numero,a.nom,a.client,a.charge_affaires_id,a.statut_opportunite,a.date_opportunite,a.date_montage,a.updated_at FROM affaires a
WHERE a.phase='opportunite' AND a.archived_at IS NULL AND a.statut_opportunite = 'termine' ORDER BY a.updated_at DESC $function$;