# Roadmap

## Fait aujourd'hui (15 oct. 2026)
- [x] Bug flèche pipeline : la page /opportunites ne rendait jamais la fiche enfant (pas d'Outlet) — corrigé en séparant la liste (route index) du gabarit (Outlet). Vérifié kanban + tableur + retour arrière.
- [x] Menu simplifié « suivi des affaires » : flag `deploiement_suivi_affaires` actif, menu = Pipeline opportunités + Demandes clients + Chantiers uniquement, tout le reste caché (accueil, planning, logistique, RH, Admin). Aucun blocage d'URL.

## À venir
- [ ] **Module « planning logistique »** (demande Gabin 15/10) : nouveau planning lié aux montages / démontages / livraisons / approvisionnements / chargements / déchargements. Les modules planning existants (Planning général, Tableau d'atelier, Charge atelier, Qui est où) sont seulement CACHÉS, pas supprimés. Le module Échéances doit être revu et mixé avec ce planning logistique.

## Planning logistique (CDC Project Shift)
- [x] Lot 1 — Socle (étapes, contacts, besoins, paramètres, droits)
- [x] Lot 2 — Planning /logistique + écran atelier /ecran-atelier
- [x] Lot 3 — Onglet Logistique sur le chantier, choix véhicule, conflits
- [ ] Lot 4 — IA lecture jalonnements (pièces jointes log@ + dépôt manuel)
- [ ] Lot 5 — Rétroplanning + écran de validation des propositions
- [ ] Lot 6 — Relances
- [ ] Lot 7 — Calendrier Outlook log@ (attend droit Calendars.ReadWrite côté Microsoft)
- [ ] Compte « Écran atelier » (attend email de la TV)
