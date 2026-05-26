---
name: Routes mobile orphelines / stubs
description: Audit 25/05/26 — routes mobile non câblées à la nav, en attente de décision Gabin.
type: constraint
---

**Audit indépendant 25/05/26** — routes mobile présentes mais inaccessibles via nav :

- `/mobile/mois` — vue calendrier mensuelle (252 lignes), aucun lien depuis MobileBottomNav. À garder (ajouter lien depuis /mobile/aujourdhui ?) ou supprimer.
- `/mobile/chef/fabrication` — STUB "Module disponible au Tour 2". Mensonge UX si annoncé sans contenu. Soit livrer le module, soit retirer la route.
- `/mobile/chef/staffer` — doublon de l'onglet Staffer présent dans `/mobile/chef/equipe`. Probable suppression.
- `/mobile/chef/affaires/$affaireId` — gallery photos minimaliste. À enrichir (accès Casting/équipe du chantier).

**Statut v0.49 Batch 9.7** : Câblage des 2 navs traité (Équipe employé + Missions chef pointent désormais vers routes réelles). Nettoyage de ces 4 routes orphelines en attente d'arbitrage Gabin (cf. message de l'audit, Problème 4).

**Why :** une route livrée mais non accessible = code mort. Un stub "à venir" en prod = perte de confiance terrain.
