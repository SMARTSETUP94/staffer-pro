# Refonte page /aujourdhui pour les employés

## Objectif

Rendre la page d'accueil `/aujourdhui` réellement utile et user-friendly pour les **employés** (poseur, peintre, métallier, menuisier, etc.) — desktop ET mobile — au lieu de la vue Inbox/filtres actuelle pensée pour admin/chef.

Les rôles admin/chef gardent leur vue actuelle (Inbox + widgets pilotage). Seuls les rôles **employés** (sans cap `dashboard.team.view`) basculent sur la nouvelle vue.

## Nouvelle structure employé (3 blocs principaux)

### Bloc 1 — Mon planning de la semaine
- Vue compacte 7 jours (lun→dim) avec mes affectations
- Chaque ligne = 1 chantier × 1 créneau (AM/PM/Journée)
- **Clic sur un chantier → ouvre un Sheet "Mon équipe sur ce chantier"** (au lieu d'un onglet séparé `/equipe-chantiers`). Liste les coéquipiers présents le même jour/créneau, leur métier, contact rapide.
- Bouton "Voir tout mon planning" → `/mes-missions`

### Bloc 2 — Mes heures
- Carte "Cette semaine" : compteur circulaire X h / 39h (déjà existant, conservé)
- **Bouton primaire "Saisir mes heures"** → `/mes-heures`
- **Lien secondaire "Voir l'historique"** → `/mes-heures?vue=historique` (saisies passées + statuts validation : brouillon / soumis / validé / refusé)

### Bloc 3 — Atelier (conditionnel)
- **Affiché UNIQUEMENT si le métier de l'employé ≠ poseur** (donc pour peinture, métallerie, menuiserie/construction, tapisserie, numérique, machiniste = atelier Setup Paris)
- Liste mes objets de fabrication en cours (filtrée sur mon métier via `fabrication_objet_equipe`), avec affaire + statut + lien fiche objet
- Vide si rien : empty state "Aucun objet en fabrication pour vous"

## Mécanisme de routage

Sur `/aujourdhui`, basculer entre 2 vues selon la cap :
- `dashboard.team.view` (admin/chef) → vue actuelle (Inbox + widgets)
- sinon (employés) → nouvelle vue `EmployeAujourdhuiView`

## Fichiers à créer/modifier

### Création
- `src/components/aujourdhui/EmployeAujourdhuiView.tsx` — orchestrateur 3 blocs
- `src/components/aujourdhui/MonPlanningSemaineCard.tsx` — bloc 1
- `src/components/aujourdhui/MonEquipeChantierSheet.tsx` — Sheet équipe au clic
- `src/components/aujourdhui/MesHeuresCard.tsx` — bloc 2 (refonte du widget existant)
- `src/components/aujourdhui/MesObjetsAtelierCard.tsx` — bloc 3
- `src/server/aujourdhui-employe.functions.ts` — 3 server fns :
  - `getMonPlanningSemaine()` → assignations × créneaux semaine en cours
  - `getMonEquipeChantier({ affaireId, date })` → coéquipiers présents
  - `getMesObjetsAtelier()` → mes objets fabrication (vide si poseur)

### Modification
- `src/routes/_app.aujourdhui.tsx` — branchement conditionnel cap `dashboard.team.view` vs `EmployeAujourdhuiView`

## Backend

Aucune migration DB. Tout est dérivé des tables existantes :
- `assignations` + `affaires` pour le planning semaine
- `assignations` (mêmes affaire+date) pour Mon équipe
- `heures_saisies` pour les heures
- `fabrication_objet_equipe` + `fabrication_objets` pour l'atelier
- Détection poseur : `employes.metier_principal = 'poseur'` ou cap `mes_missions.view` sans `section.planning_fab`

## Responsive

- **Mobile (<768px)** : 3 blocs empilés, Bloc 1 d'abord (planning = action #1 du matin)
- **Desktop (≥768px)** : grille 2 colonnes — col gauche : Planning semaine (large), col droite empilée : Mes heures + Atelier

## Hors scope

- Pas de refonte admin/chef
- Pas de modification des routes `/mes-heures`, `/mes-missions` (juste des liens vers elles)
- Pas de bottom nav mobile (déjà OK)
- Historique heures = lien vers `/mes-heures?vue=historique` (l'onglet est déjà censé exister ou sera affiché en query param — à confirmer en explorant le fichier)
