---
name: LOT 1 — Vue Échéances
description: Page /echeances (point d'entrée management) + champs montage_* sur affaires
type: feature
---
# LOT 1 — Vue Échéances (1er août 2026)

## DB
`affaires` : `montage_nb_techniciens` smallint, `montage_travail_nuit` bool NOT NULL default false,
`montage_nb_semi` smallint, `montage_nb_20m3` smallint, `montage_nature_prestation` text, `montage_notes` text.
Migration idempotente (`ADD COLUMN IF NOT EXISTS`).

## UI
- `src/routes/_app.echeances.tsx` — lecture client Supabase (RLS), pas de server fn.
  Une affaire génère jusqu'à 2 opérations (Montage sur `date_montage`, Démontage sur `date_demontage`).
  Montage multi-jours → « 27 → 28 août » si `date_demontage` ≠ `date_montage`.
  Compte à rebours J−n / Aujourd'hui / J+n (gris si passé).
  Statut : **Prospect** (ambre) si `phase = 'opportunite'` OU `statut = 'prospect'`, sinon **Confirmé**.
  Exclusions : `archived_at IS NULL` + `statut <> 'annule'`.
  Search params validés zod : `fenetre` (14j/1m/3m, défaut 1m), `type`, `statut`, `q`.
- Édition des champs montage : bloc « Dates clés chantier » de `_app.affaires.$affaireId.index.tsx`
  (même bouton d'enregistrement que les dates).
- Sidebar : entrée « Échéances » en premier de la section **Pilotage**, cap `section.affaires`, icône `CalendarClock`.
