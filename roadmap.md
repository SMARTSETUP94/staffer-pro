# Roadmap

## Calendrier chantier (17 oct. 2026)
- [ ] Fenêtre de calendrier d'un seul chantier depuis le planning logistique, recherche et dates vides masquées.
- [ ] Modification via le formulaire existant selon les droits, tests et vérification dans l'application.

## Fait aujourd'hui (15 oct. 2026)
- [x] Bug flèche pipeline : la page /opportunites ne rendait jamais la fiche enfant (pas d'Outlet) — corrigé en séparant la liste (route index) du gabarit (Outlet). Vérifié kanban + tableur + retour arrière.
- [x] Menu simplifié « suivi des affaires » : flag `deploiement_suivi_affaires` actif, menu = Pipeline opportunités + Demandes clients + Chantiers uniquement, tout le reste caché (accueil, planning, logistique, RH, Admin). Aucun blocage d'URL.

## À venir
- [ ] **Module « planning logistique »** (demande Gabin 15/10) : nouveau planning lié aux montages / démontages / livraisons / approvisionnements / chargements / déchargements. Les modules planning existants (Planning général, Tableau d'atelier, Charge atelier, Qui est où) sont seulement CACHÉS, pas supprimés. Le module Échéances doit être revu et mixé avec ce planning logistique.

## Planning logistique (CDC Project Shift)
- [x] Lot 1 — Socle (étapes, contacts, besoins, paramètres, droits)
- [x] Lot 2 — Planning /logistique + écran atelier /ecran-atelier
- [x] Lot 3 — Onglet Logistique sur le chantier, choix véhicule, conflits
- [x] Lot 4 — IA lecture jalonnements (pièces jointes log@ + dépôt manuel)
- [x] Lot 5 — Rétroplanning + écran de validation des propositions
- [ ] Lot 6 — Relances
- [x] Lot 7 — Calendrier Outlook log@ : ABANDONNÉ (Gabin 15/10) — le planning logistique vit dans l'app (mobile inclus) ; synchro Outlook éventuelle plus tard, certains éléments seulement
- [ ] Compte « Écran atelier » (attend email de la TV)
