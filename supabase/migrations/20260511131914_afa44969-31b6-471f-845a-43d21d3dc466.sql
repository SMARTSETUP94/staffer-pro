UPDATE public.contrat_templates
SET contenu_html = REPLACE(contenu_html, 'catégorie <strong>Non-cadre</strong>', 'catégorie <strong>{{categorie_pro}}</strong>'),
    contenu_json = NULL,
    nom = 'CDDU Technicien du Spectacle v2.2 — categorie_pro dynamique',
    updated_at = now()
WHERE actif = true AND contenu_html LIKE '%catégorie <strong>Non-cadre</strong>%';