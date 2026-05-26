---
name: Bloc 9 — Carte mission pose
description: Cartes mission pose mobile (montage/démontage). Lot 9.1 fondations DB livré. Table mission_events, 5 colonnes infos terrain affaires, 3 server fns, fallback notif chef via table notifications existante.
type: feature
---

# Bloc 9 — Carte mission pose (mobile-first)

Sprint en cours après validation terrain Sprint D. Décisions validées en bloc par Gabin :
- Q1 ✅ pas de filtre métier sur `getMesMissions` (tous métiers)
- Q2 ✅ pas de policy INSERT chef sur `mission_events` (V1 employé self only)
- Q3 ✅ helper compression photo `src/lib/image-compress.ts` (alias mince de `image-compression.ts`)
- Q4 ✅ fallback notif chef = insert dans `notifications` (table existante) + toast — pas besoin de créer une nouvelle table
- Q5 ✅ 7e spec E2E multi-mission/jour à ajouter

## Lot 9.1 — Fondations DB ✅ LIVRÉ

**Schéma**
- `mission_events` (id, affaire_id, employe_id, phase montage|demontage, type enum arrivee/depart/probleme/photo/message, occurred_at, latitude, longitude, note, photo_doc_id → affaire_documents, created_by). Journal immutable (pas de UPDATE/DELETE).
- `affaires` + 5 colonnes : `acces_livraison`, `code_acces`, `consignes_tenue`, `contact_site_nom`, `contact_site_tel`.
- Enum `notification_type` += `mission_probleme`.
- Capabilities `mon-poste.mission.record_event` + `mon-poste.mission.signal_probleme` (+ matrice : admin/poseur/employe = true, autres = false). `mon-poste.mission.view` existait déjà.

**RLS** (fix profile_id vs user_id appliqué partout)
- SELECT : `is_chef_or_admin()` OR `employe_id IN (SELECT id FROM employes WHERE profile_id = auth.uid())`
- INSERT : self only via même CTE — pas de chef INSERT
- Pas de UPDATE/DELETE policy.

**Server fns** dans `src/server/mission-card.functions.ts` :
- `getMesMissions` → fenêtre J-7 → J+30, agrège (affaire × phase), retourne MissionListItem[]
- `getCarteMission` → détail complet (affaire, infos terrain, assignations user, équipe phase, chef, events user)
- `recordMissionEvent` → insert via RLS user, si type=probleme alors insert notification chef via `supabaseAdmin`

**Fixes connexes**
- `src/components/NotificationBell.tsx` : icône 🚨 pour le nouveau type `mission_probleme`.

## Lots restants (à venir)
- 9.2 Liste `/mobile/mes-missions` + 3 composants
- 9.3 Carte détaillée `/mobile/mission/$id` + 8 sous-composants
- 9.4 Saisie heures auto à partir des events arrivee/depart + photos auto-taggées
- 9.5 Signaler problème + 7 specs E2E
