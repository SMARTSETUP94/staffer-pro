---
name: Dette — RLS bypass bureau_etude sur objet.edit
description: BE peut UPDATE n'importe quel champ fabrication_objets via API directe (UI cache mais ne protège pas)
type: constraint
---

# Dette technique : RLS bypass bureau_etude sur objet.edit

**Date identification :** 23 mai 2026, Bloc 8 Lot 8.1
**Statut :** Accepté court terme, à durcir avant v1.0

## Problème

La cap `objet.edit` est `granted=true` pour le rôle `bureau_etude`. Côté UI (Lot 8.2), seuls les champs liés aux plans CAD seront éditables ; les champs métier (titre, qté, heures prévues, type finition, etc.) sont masqués/disabled.

**Trou :** un utilisateur `bureau_etude` qui bypasse l'UI (curl avec son JWT, devtools, supabase-js direct) peut UPDATE n'importe quelle colonne de `fabrication_objets` car la RLS `fabrication_objets_modify_chef_admin` accepte aussi les chefs via `is_chef_metier_scoped()` mais surtout, BE est admin/chef côté policy d'écriture via les rôles applicatifs ? **À vérifier** — possiblement déjà bloqué côté RLS (BE n'a peut-être pas `is_chef_or_admin()`).

## Mitigation court terme (Lot 8.2)

UI cache/disable les champs hors-CAD pour les utilisateurs `bureau_etude`. Couverture suffisante pour usage interne (pas d'utilisateurs SQL-savvy hostiles).

## Mitigation long terme (à planifier)

Option A — Trigger Postgres :
```sql
CREATE OR REPLACE FUNCTION public.guard_fabrication_objets_bureau_etude()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_be boolean;
BEGIN
  -- Si user est UNIQUEMENT bureau_etude (pas cumul chef/admin)
  SELECT has_role(auth.uid(), 'bureau_etude'::app_role)
    AND NOT is_chef_or_admin()
    INTO is_be;
  IF is_be THEN
    -- Autoriser uniquement modif des colonnes CAD-related
    IF OLD.nom IS DISTINCT FROM NEW.nom
       OR OLD.reference IS DISTINCT FROM NEW.reference
       OR OLD.quantite IS DISTINCT FROM NEW.quantite
       OR OLD.heures_prevues_be IS DISTINCT FROM NEW.heures_prevues_be
       /* ...autres colonnes interdites... */
    THEN
      RAISE EXCEPTION 'bureau_etude ne peut modifier que les champs plans CAD';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

Option B — Split server functions : `updateObjetIdentite` (cap `objet.edit.full`) vs `updateObjetPlanCad` (cap `objet.edit.cad`). Plus propre architecturalement, demande refactor du dialog d'édition existant.

**Recommandation :** Option B au moment du Bloc 8.2 si on a 1-2h de budget supplémentaire, sinon traçable en backlog post-Bloc 8.
