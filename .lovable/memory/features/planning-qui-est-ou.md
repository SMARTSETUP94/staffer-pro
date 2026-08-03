---
name: Planning par personne (Qui est où)
description: LOT 7 — route /qui-est-ou, grille personnes×jours, vue inversée par chantier, anomalies, KPIs occupation, écart effectif prévu/nommé
type: feature
---
Route `src/routes/_app.qui-est-ou.tsx` (section Pilotage, cap `section.planning_fab`).
Helpers purs : `src/lib/qui-est-ou.ts` — hook data : `src/hooks/use-qui-est-ou.ts` (React Query, 1 requête par table, chunk 200 sur les affaires).

Règles métier :
- Source du nommage = `assignations` (employe_id, affaire_id, date, demi_journee). Le prévisionnel anonyme reste `atelier_planning.nb_pers`.
- Absences : uniquement `valide = true`. Elles réduisent les jours ouvrables du taux d'occupation (JOURNEE = 1, AM/PM = 0,5).
- Anomalie « double » = deux chantiers DIFFÉRENTS sur des créneaux qui se recouvrent le même jour. Deux lignes du même chantier ne sont jamais une anomalie.
- Anomalie « absent » = affectation recouvrant une absence validée ; elle prime sur « double ».
- Écart effectif : Σ nb_pers prévues vs nb de couples (personne, jour) nommés, par métier, sur la fenêtre affichée.

État d'écran (période, vue, filtres) en search params URL, pas en useState.
