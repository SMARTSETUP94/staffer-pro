# Roadmap

## Calendrier chantier (17 oct. 2026)
- [x] Fenêtre de calendrier d'un seul chantier depuis le planning logistique, recherche et dates vides masquées.
- [x] Modification via le formulaire existant selon les droits ; 20 tests verts, vérification sur chantier 4130, enregistrement et retour au calendrier, affichage mobile.
- [x] Planning logistique ouvert par défaut sur 1 semaine glissante depuis aujourd'hui (J → J+6) au lieu de 2 semaines calées sur le lundi ; bouton « Aujourd'hui » aligné, titre « Du … au … ». Garde-fou Vitest `planning-fenetre-defaut.test.ts`, vérifié dans l'app (7 colonnes dès le 17 oct.).

## Fait aujourd'hui (15 oct. 2026)
- [x] Bug flèche pipeline : la page /opportunites ne rendait jamais la fiche enfant (pas d'Outlet) — corrigé en séparant la liste (route index) du gabarit (Outlet). Vérifié kanban + tableur + retour arrière.
- [x] Menu simplifié « suivi des affaires » : flag `deploiement_suivi_affaires` actif, menu = Pipeline opportunités + Demandes clients + Chantiers uniquement, tout le reste caché (accueil, planning, logistique, RH, Admin). Aucun blocage d'URL.

## À venir
- [ ] Réparer l’accès au calendrier Outlook (17 oct.) — diagnostic réel : authentification Microsoft 200, lecture emails log@ 200, lecture calendriers log@ 403 ErrorAccessDenied ; bloqué par l’autorisation Microsoft côté tenant (vérifier Calendars.ReadWrite Application + consentement administrateur, puis les restrictions Exchange si nécessaire). Aucun changement d’identifiants requis à ce stade ; synchronisation complète à vérifier après autorisation.
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
