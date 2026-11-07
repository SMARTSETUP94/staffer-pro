# Planning atelier simple + Planning bureau d'étude

Ce lot vient après « Qualité des données ». Il n'utilise aucune nouvelle table, ne supprime rien et rien n'est publié. Le plan de fabrication, l'auto-staffing, le tableau d'atelier et les objets restent en place mais ne sont pas branchés.

## État constaté
- 14 chantiers 6XXX en cours et 1 opportunité 9XXX « presque gagnée ».
- Aucune ligne dans le planning métier par chantier (`affaire_planning_metier`).
- Capacités par jour des métiers :

| Métier | Capacité/jour |
|---|---|
| Menuiserie | 20 |
| Métallerie | 6 |
| Peinture | 10 |
| Numérique (CNC) | 1 |
| Tapisserie | 4 |
| Bureau d'étude | 2 |
| Impression UV | non renseignée |
| Machiniste | non renseignée |

- Concepteurs référents :
  - principaux : Nadège MEVEL, Guillaume MAQUARIE, Kevin Lebon ;
  - secondaires : Laurent DEBRANCHE, ainsi que trois autres (Alexandre FERANT, Claude ARECCHIA, Patrick SZMIDT).
  - Seuls les quatre que vous avez nommés auront une ligne ; les autres pourront être ajoutés.
- Les fonctions d'affectation d'un rôle projet avec dates et de charge BE des devis existent déjà.

## Composant commun « planning en barres »
- 8 à 12 semaines visibles, aujourd'hui marqué, navigation par semaine (même en-tête que Dispos et Logistique).
- Glisser une barre pour la déplacer, tirer un bord pour la rallonger (calé sur le jour), clic pour ouvrir une petite fiche.
- Une couleur par chantier, la même dans les deux plannings ; barres en pointillé ou hachurées pour le prévisionnel.
- Mobile (390 px) : liste par semaine, en lecture seule.

## 1. Planning atelier (nouvelle page, groupe Production)
- **Lignes :** une par chantier 6XXX en cours, plus les 9XXX presque gagnés en pointillé « prévisionnel », triées par date de départ.
- **Trait « départ » :** première étape logistique de chargement ou livraison du chantier.
- **Barre chantier :** dates proposées puis ajustables.
  - Fin = veille du départ, sinon date de montage moins un jour ouvré.
  - Début = fin moins la durée estimée (heures du devis réparties sur la capacité, 2 semaines par défaut).
- **Sous-lignes dépliables par métier :** BE, CNC, Menuiserie, Métallerie, Peinture, Tapisserie, Impression. Chaque barre porte un total d'heures saisi rapidement, pré-rempli depuis le devis Staffing validé s'il existe.
- **Ligne « Charge » :**
  - Par semaine et par métier : heures réparties sur les jours ouvrés de chaque barre ÷ (capacité × 8 h × jours ouvrés, fériés français exclus).
  - Vert sous 80 %, ambre de 80 à 100 %, rouge au-delà.
  - Clic : liste des chantiers qui chargent.
- **Alertes :** fin atelier après le départ logistique ; chantier signé sans période atelier ; métier en surcharge.
- **Pas dans ce lot :** noms de personnes, objets, demi-journées.
- **Droits :** admin, logistique et chefs atelier modifient ; chargés d'affaires en lecture.

## 2. Planning bureau d'étude (remplace la vue « Planning BE / projets »)
- **Lignes :** une par concepteur, avec une capacité réglable en % (100 % par défaut ; à baisser pour Kevin et Laurent, aussi chargés d'affaires).
- **Barres :** affaires où la personne est concepteur, avec les dates du rôle. On crée une barre sur la ligne en choisissant l'affaire, on la déplace ou on la rallonge ; chaque changement passe par la fonction d'affectation existante.
- **Charge par semaine :**
  - jours BE des devis validés ;
  - à défaut, heures « Plans BEM » du dernier brouillon, marquées « estimation » ;
  - répartis sur la barre ÷ capacité.
  - Les opportunités non signées sont hachurées.
- **Alertes :** BE finissant après le début de l'atelier du même chantier ; chantier signé sans concepteur ; concepteur au-delà de 100 %.
- L'ancienne URL redirige vers la nouvelle vue.

## 3. Lien entre les deux plannings
Depuis une barre atelier, un lien ouvre la barre BE du même chantier, et inversement. Les couleurs sont identiques.

## Modification de base (montrée avant application)
- **Planning métier par chantier :**
  - ajouter une colonne d'heures prévues ;
  - permettre une ligne sans métier, qui représente la période atelier globale du chantier, avec une seule ligne de ce type par chantier.
- **Fiches concepteurs :** ajouter une colonne de capacité en % (défaut 100).
- **Capacités Impression UV et Machiniste :** valeurs à me donner, ou laissées vides (la charge s'affiche alors sans pourcentage).
- **Droits d'écriture :** passent par des fonctions qui vérifient le rôle (admin, logistique, chefs atelier).

## Tests
- Charge : jours ouvrés et fériés français, répartition uniforme, seuils de couleur.
- Proposition des dates depuis la logistique, sinon depuis le montage.
- Glisser et rallonger : nouvelles dates calées sur le jour.
- Droits : le chargé d'affaires ne fait que lire.
- Écrans à 390 et 1366 px, avec une capture de chaque écran en fin de lot.

## Détails techniques
- Composant unique `PlanningBarres` ; règles pures (charge, proposition de dates, alertes) dans `src/lib/planning-barres.ts`, réutilisant les jours ouvrés et fériés existants (`staffing/date-utils`).
- L'atelier lit `affaire_planning_metier`, `affaires`, `affaire_etapes_logistiques` et les heures des devis validés.
- Le BE lit `affaire_roles` et `role_referents`, et écrit via `app_affecter_role_projet` ; la charge vient de `devis_charge_be`.
