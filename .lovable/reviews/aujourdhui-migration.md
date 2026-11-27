# Migration page « Aujourd'hui »

Seules deux parties changent (le reste est recopié tel quel depuis la base) :
- **Heures à saisir** : uniquement les heures de la personne connectée.
- **Devis brouillons** : uniquement les affaires où la personne est dans l'équipe projet, ou dont elle est l'auteur. Les brouillons Claude deviennent **une seule ligne** « N brouillons Claude à revoir » (tous pour les admins, menant à Qualité des données).

```sql
  mes_employes AS (
    SELECT e.id FROM public.employes e WHERE e.profile_id = v_uid
  ),
  devis_scope AS (
    SELECT d.id, d.numero, d.created_at, d.affaire_id, d.cree_par_mcp, af.numero AS af_numero
    FROM public.devis d
    LEFT JOIN public.affaires af ON af.id = d.affaire_id
    WHERE v_cap_devis_brouillon
      AND d.statut = 'brouillon'
      AND d.archive = false
      AND d.created_at >= now() - INTERVAL '90 days'
      AND (
        (d.cree_par_mcp AND v_is_admin)
        OR d.auteur_id = v_uid
        OR EXISTS (
          SELECT 1 FROM public.affaire_roles r
          WHERE r.affaire_id = d.affaire_id
            AND r.employe_id IN (SELECT me.id FROM mes_employes me)
        )
      )
  ),
  devis_brouillon AS (
    SELECT
      'devis_brouillon:' || ds.id::text,
      'devis_brouillon'::text,
      ds.id,
      'medium'::text,
      ('Devis brouillon — ' || COALESCE(ds.numero,'?')),
      (COALESCE(ds.af_numero,'?') || ' · créé ' || to_char(ds.created_at,'DD/MM')),
      ds.affaire_id, ds.af_numero,
      ('/affaires/' || ds.affaire_id::text || '/devis'),
      ds.created_at
    FROM devis_scope ds
    WHERE NOT ds.cree_par_mcp
    UNION ALL
    SELECT
      'devis_brouillon_claude:' || to_char(CURRENT_DATE,'IYYY-IW'),
      'devis_brouillon'::text,
      NULL::uuid,
      'medium'::text,
      (count(*)::text || ' brouillon' || CASE WHEN count(*) > 1 THEN 's' ELSE '' END || ' Claude à revoir'),
      ('Le plus ancien créé le ' || to_char(min(ds.created_at),'DD/MM')),
      NULL::uuid, NULL::text,
      (CASE WHEN v_is_admin THEN '/admin/qualite-donnees' ELSE '/devis' END),
      max(ds.created_at)
    FROM devis_scope ds
    WHERE ds.cree_par_mcp
    HAVING count(*) > 0
  ),
  heures_saisir AS (
```
