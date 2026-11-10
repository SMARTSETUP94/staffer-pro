# Terminer la lecture des personnes atelier

Les six fonctions de la migration B contiennent les filtres atelier et leurs droits sont conservés. Les noms, l’ajout/retrait, les badges et la vue Personnes sont construits. Les essais à 390 et 1366 px ont été retirés ; aucune notification ni heure saisie créée, aucune présence atelier dans le lecteur logistique.

## Complément indispensable
Le lecteur actuel du planning logistique ne donne pas accès aux chefs d’atelier. Ajouter un lecteur réservé au planning atelier, sans élargir les droits d’écriture ni exposer téléphones, contrats ou rémunérations.

Après accord, appliquer le SQL ci-dessous, remplacer le lecteur actuel et vérifier l’accès des rôles atelier.

## SQL proposé
Le texte complet est dans `.lovable/atelier-personnes-lecture-proposee.sql`, reproduit ci-dessous avant toute application.
```sql
-- Complément de lecture uniquement ; aucune donnée existante modifiée.
CREATE FUNCTION public.planning_atelier_personnes_lire(_debut date, _fin date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE editeur boolean;
BEGIN
  editeur := public.planning_atelier_ecriture_autorisee();
  IF auth.uid() IS NULL OR NOT (editeur OR public.user_has_cap('section.affaires') OR public.user_has_cap('planning.pilotage'))
     OR _debut IS NULL OR _fin IS NULL OR _fin < _debut OR _fin - _debut > 130 THEN
    RAISE EXCEPTION 'Accès ou période invalide' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'presences', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',a.id,'affaire_id',a.affaire_id,'metier_id',a.metier_id,'date',a.date,
      'employe_id',a.employe_id,'dispos_intervenant_id',a.dispos_intervenant_id,'badge_atelier',a.badge_atelier) ORDER BY a.date,a.id)
      FROM public.assignations a WHERE a.pole_planning='atelier' AND a.date BETWEEN _debut AND _fin
        AND (editeur OR public.user_has_affaire_access(a.affaire_id))), '[]'::jsonb),
    'personnes', coalesce((SELECT jsonb_agg(p ORDER BY p.id) FROM (
      SELECT e.id,e.prenom,e.nom,e.actif,'employe'::text origine FROM public.employes e
      WHERE (editeur AND e.actif) OR EXISTS (
        SELECT 1 FROM public.assignations a WHERE a.employe_id=e.id AND a.pole_planning='atelier'
          AND a.date BETWEEN _debut AND _fin AND (editeur OR public.user_has_affaire_access(a.affaire_id)))
      UNION ALL
      SELECT i.id,i.prenom,i.nom,i.actif,'dispos'::text FROM public.dispos_intervenants i
      WHERE (editeur AND i.actif AND i.employe_id IS NULL) OR EXISTS (
        SELECT 1 FROM public.assignations a WHERE a.dispos_intervenant_id=i.id AND a.pole_planning='atelier'
          AND a.date BETWEEN _debut AND _fin AND (editeur OR public.user_has_affaire_access(a.affaire_id)))
    ) p), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.planning_atelier_personnes_lire(date,date) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.planning_atelier_personnes_lire(date,date) TO authenticated;
```
