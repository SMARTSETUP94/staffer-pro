---
name: Marge chantier Phase 5 persistance serveur
description: Migration localStorage → table Supabase dédiée pour partage cross-user et backup automatique
type: feature
---
Différée post-Option A (30 mai 2026). ~5h.

## Périmètre
- Nouvelle table `marge_chantier_workspace` (id uuid, owner_id uuid, payload jsonb, updated_at) — 1 workspace par admin OU 1 workspace partagé global (à trancher avec Gabin).
- RLS : admin only (SELECT/INSERT/UPDATE/DELETE).
- Migration `loadAppData` / `saveAppData` → ServerFn `loadMargeWorkspace` / `saveMargeWorkspace` avec debounce 2s + retry réseau.
- Conservation du fallback localStorage en cache offline (lecture seule si réseau KO).
- Migration douce : au premier load post-déploiement, lire localStorage existant et UPSERT côté serveur (puis purger local).
- Bouton "Verrouiller en lecture seule" pour empêcher modif concurrente pendant analyse mensuelle.
- Historique snapshots : table `marge_chantier_snapshots` (snapshot mensuel auto via pg_cron 1er du mois) pour comparer marges N vs N-1.

## Dépendances
- Aucune dépendance technique sur Phases 2/3/4.
- Décision produit : workspace personnel par admin OU workspace global partagé (cf. Gabin).

## Valeur métier
- Partage cross-user (DAF + DG + Gabin voient la même donnée).
- Backup automatique (vs localStorage perdu si cache navigateur vidé).
- Historique mensuel auditable.

## Risques
- Conflits d'édition concurrente (CRDT vs last-write-wins → trancher).
- Payload jsonb potentiellement volumineux (>1MB si nombreux chantiers) → envisager normalisation partielle.
