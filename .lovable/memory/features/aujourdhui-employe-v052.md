---
name: Aujourdhui employé v0.52
description: Refonte /aujourdhui pour employés livrée en v0.52 — 3 blocs (planning semaine, mes heures, mon atelier) branchés sur la home `/` via cap-driven routing
type: feature
---

# Refonte page d'accueil employés — livrée v0.52

## Branchement

- **Route** : pas de `/aujourdhui` dédiée. Le rendu est fait sur `_app.index.tsx` (la home `/`) via cap-driven routing : si l'utilisateur n'a PAS `dashboard.team.view`, on rend `EmployeAujourdhuiView` au lieu de l'Inbox+widgets admin/chef.
- **Alias** : `src/routes/_app.aujourdhui.tsx` redirige `/aujourdhui` → `/` (bookmarks externes, anciens liens notifs/emails).
- **Routing post-login** : `post-login-routing.ts` envoie déjà tout employé vers `/` → cohérent.

## Composants livrés

`src/components/aujourdhui/EmployeAujourdhuiView.tsx` (490 lignes, orchestrateur unique — pas de découpage en 4 sous-fichiers comme prévu initialement, simplicité retenue).

3 blocs :
1. **Mon planning semaine** (lignes 75-193) : 7 jours AM/PM, clic chantier → `MonEquipeSheet` (lignes 194-307) qui liste coéquipiers présents même jour/créneau.
2. **Mes heures** (lignes 312-392) : compteur 39h via `useMesHeures`, bouton "Saisir" + lien "Voir historique" (tous deux → `/mes-heures`, pas de query param `?vue=historique` — l'historique vit dans la même page).
3. **Mon atelier** (lignes 393-470) : liste objets fab via `getMesObjetsAtelier()`, masqué automatiquement si 0 objet (couvre poseurs ET tout métier sans objet en cours).

## Server fns

`src/server/aujourdhui-employe.functions.ts` (254 lignes) :
- `getMonPlanningSemaine()` — assignations × créneaux semaine
- `getMonEquipeChantier({ affaireId, date })` — coéquipiers présents
- `getMesObjetsAtelier()` — objets fab via `fabrication_objet_equipe`

## Test E2E

`e2e/aujourdhui-multirole.spec.ts` couvre admin/chef/employé.

## Écarts vs plan initial

| Plan | Réalité | Raison |
|------|---------|--------|
| Route `/aujourdhui` dédiée | Branchement sur `/` + alias redirect | Cohérent avec `post-login-routing.ts` qui pointe vers `/` |
| 4 sous-composants séparés | 1 orchestrateur de 490 lignes | Simplicité, sections clairement délimitées |
| Détection poseur via `metier_principal` | Masquage auto si 0 objet | Plus robuste (couvre peintre sans objet en cours aussi) |
| Lien `?vue=historique` | Lien simple vers `/mes-heures` | L'historique est intégré à la grille semaine, pas d'onglet séparé |

## Responsive

- Mobile (<768px) : 3 blocs empilés, Planning en premier
- Desktop (≥768px) : grille 2 colonnes — Planning à gauche, Heures+Atelier empilés à droite
