---
name: Bloc 9 — Carte mission pose
description: Cartes mission pose mobile (montage/démontage). Lots 9.1 → 9.4 livrés. 2 routes mobiles + bonus infos pose + section heures auto + FAB photo auto-tag. Helpers `mission-card-helpers.ts` (computeHeuresFromEvents + autoTagCategoryByMissionState). Migration `affaire_documents.categorie` + `mission_phase`. GPS lien universel (Google Maps cross-OS, plus Apple Maps). 4 vitest + 4 specs E2E.
type: feature
---

# Bloc 9 — Carte mission pose (mobile-first)

Sprint en cours après validation terrain Sprint D. Décisions validées en bloc par Gabin :
- Q1 ✅ pas de filtre métier sur `getMesMissions` (tous métiers)
- Q2 ✅ pas de policy INSERT chef sur `mission_events` (V1 employé self only)
- Q3 ✅ helper compression photo `src/lib/image-compress.ts` (alias mince)
- Q4 ✅ fallback notif chef = insert dans `notifications` + toast
- Q5 ✅ 7e spec E2E multi-mission/jour à ajouter (au Lot 9.5)

## Lot 9.1 — Fondations DB ✅ LIVRÉ
- Table `mission_events` (immutable, RLS self only) + enum `mission_event_type`.
- `affaires` + 5 colonnes pose (`acces_livraison`, `code_acces`, `consignes_tenue`, `contact_site_nom`, `contact_site_tel`).
- Enum `notification_type` += `mission_probleme`. Capabilities `mon-poste.mission.*`.
- 3 server fns dans `src/server/mission-card.functions.ts` (getMesMissions / getCarteMission / recordMissionEvent).
- `NotificationBell` icône 🚨 pour mission_probleme.

## Lot 9.2 — Liste missions mobile ✅ LIVRÉ
- Route `/mobile/mes-missions` (`src/routes/mobile.mes-missions.tsx`).
- Buckets : Cette semaine / Semaine prochaine / Plus tard / Passées (auto-cachés si vides).
- MissionCard avec phase icon (Wrench/PackageCheck), statut chip (en_cours/a_venir/passee), formatage date range FR.
- Empty state + error retry + Link preload="intent".
- testid : `mes-missions-empty`, `mission-bucket-*`, `mission-card-{affaireId}-{phase}`.

## Lot 9.3 — Carte mission détail mobile ✅ LIVRÉ
- Route `/mobile/mission/$affaireId/$phase` (`src/routes/mobile.mission.$affaireId.$phase.tsx`).
- 7 sections : TopBar / MissionHero (countdown setInterval 60s) / MesAssignations / InfosTerrainSection (GPS Apple Maps link) / ContactsSection (tel: links) / EquipeSection / EventsTimeline / ActionsBar fixe.
- Actions J'arrive / Je pars : géoloc best-effort (timeout 5s), enregistrent un `mission_events`.
- Action Problème : `SignalProblemeDialog` avec textarea max 2000 chars → recordMissionEvent type=probleme → trigger notif chef.
- testid : `mission-detail-page`, `mission-hero`, `mission-actions-bar`, `action-arrivee|depart|probleme`, `probleme-note-input|submit`, `mission-equipe`, `mission-events*`, `mission-infos*`, `mission-contacts`.

## Bonus — Section "Infos pose & livraison" ✅ LIVRÉ
- `src/components/affaire/AffaireInfosPoseSection.tsx` injecté dans `/affaires/$id/` (synthèse) gated `isAdminOrChef`.
- 5 inputs nullable mappés sur les 5 colonnes affaires. Permet à Gabin de saisir manuellement Crillon sans console Supabase.
- testid : `affaire-infos-pose`, `save-infos-pose`.

## Tests ✅ LIVRÉ Lot 9.3
- `src/server/__tests__/mission-card.test.ts` : 5 tests verts sur `statutFromDates` (helper pur) + 1 todo documentant la couverture E2E des 3 SF.
- `e2e/employe-mobile/mes-missions.employe-mobile.spec.ts` : 2 specs (rendu liste + bottom nav).
- `e2e/employe-mobile/mission-detail.employe-mobile.spec.ts` : 2 specs (rendu détail OU fallback introuvable + dialogue Signaler).

## Lot 9.4 — Saisie heures + photos auto-tag ✅ LIVRÉ

- **GPS cross-OS** : `https://www.google.com/maps/search/?api=1&query=...` (ouvre Plans sur iOS, Google Maps sur Android via intent). Apple Maps retiré.
- **Migration** : `affaire_documents` + colonnes `categorie text` et `mission_phase text` (CHECK montage|demontage), index partiel.
- **Helpers** `src/lib/mission-card-helpers.ts` :
  - `computeHeuresFromEvents(events, date)` : 1re arrivée + dernier départ → `{heure_debut, heure_fin, heures_reelles}` arrondi 15min.
  - `autoTagCategoryByMissionState(phase, state)` : priorité `incident` si probleme < 2h, sinon `avant/pendant/après_{montage|demontage}`.
- **Section MesHeures** : apparaît après 1er `depart`, pré-remplie, soumet `statut='soumis'` avec `assignation_id` + `metier_id`. Upsert (employe, date, affaire).
- **Photo FAB** flottant : input `capture="environment"`, compression, upload `affaires-photos`, insert `affaire_documents` avec `categorie` + `mission_phase`, puis `recordMissionEvent` type=photo.
- **Server fn** : `getCarteMission.assignations[].metier_id` exposé.

## Tests Lot 9.4 ✅ LIVRÉ
- `src/lib/__tests__/mission-card-helpers.test.ts` : 4 tests verts.
- `e2e/employe-mobile/mission-arrivee-depart.poseur.spec.ts` + `mission-photos.poseur.spec.ts` (skip propre si pas de seed).

## Lot 9.5 — à venir
- Polish signaler + 7e spec E2E multi-mission/jour (Q5).
- Récap final consolidé Bloc 9.
