# ADR-001 — RLS scopée chef par métier (Option D)

- **Statut** : Accepted
- **Date** : 10 mai 2026
- **Version** : v0.43.0
- **Auteurs** : équipe Staffer Pro

## Contexte

Le rôle `chef_chantier` couvre 8 métiers (construction, métallerie, peinture,
numérique, tapisserie, machiniste, logistique, suivi_projet). Certains chefs
n'ont vocation à voir/agir QUE sur les affaires de leur métier (ex : un chef
peinture ne doit pas pouvoir staffer un objet métallerie d'un autre chantier).

Avant v0.43, le rôle `chef_chantier` était unique et la RLS donnait accès
quasi-global (visibilité sur toutes les affaires, mutation libre sur les
heures et assignations dans le périmètre `user_has_affaire_access`).

## Décision

On introduit un sous-rôle applicatif `chef_metier_scoped` (option D du
brainstorming) :

1. **Source de vérité** : table `mes_affaires_chef` (vue matérialisée par RPC)
   liste les couples `(user_id, affaire_id)` autorisés pour les chefs scopés.
2. **Côté app** : les écrans sensibles (StafferMobileForm, /affaires, /validation-heures,
   /mobile/chef/*) consultent `useChefScope()` et filtrent les listes/dropdowns
   par les `affaire_id` autorisés.
3. **Côté DB** : RLS conservée souple en v0.43 (Option D : scope app-side
   d'abord), durcissement DB différé à v0.45.
4. **UX** : un `ScopedAccessBanner` informe le chef scopé qu'il ne voit qu'un
   sous-ensemble de l'app (livré v0.44.3).

## Conséquences

### Positives
- Déploiement progressif : aucun risque de régression RLS bloquante sur la
  production v0.43.
- Permet de tester le concept en condition réelle avant le durcissement DB.
- Reste auditable via `mes_affaires_chef` côté admin.

### Négatives
- **Tant que v0.45 n'est pas livrée**, un chef scopé techniquement habile
  pourrait contourner les filtres app-side (REST direct, console). Risque
  jugé acceptable car le `chef_chantier` est interne et tracé via audit.
- Double source de vérité (`user_roles` + `mes_affaires_chef`) → discipline
  nécessaire à la création/suppression d'un chef.

## Roadmap de durcissement (v0.45)

- pgTAP de bout en bout sur `mes_affaires_chef` + `user_has_affaire_access`.
- Politiques RLS spécifiques sur `heures_saisies`, `assignations`,
  `affaire_documents`, `fabrication_objets_photos` testant le scope effectif.
- Seed E2E dédié `chef_metier_scoped` (livré v0.44.4).

## Références

- v0.43.0 — `mes_affaires_chef`, `useChefScope`, `useMesAffairesChef`
- v0.44.3 — `ScopedAccessBanner` + intégration 3 écrans
- v0.44.4 — seed E2E + helper toast codes triggers
- docs/audit-v0.43-v0.44.md — finding RLS scoped
