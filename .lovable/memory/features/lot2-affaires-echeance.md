---
name: LOT 2 — Liste des affaires orientée échéance
description: Refonte de /affaires (colonnes montage/démontage, tri URL, filtre échéance, compteur sans date)
type: feature
---

# LOT 2 — `/affaires` orientée échéance

Fichier : `src/routes/_app.affaires.index.tsx`.

## Colonnes
N° · Typologie · Nom · Client · Lieu (masqué `<lg`) · **Montage** · **Démontage** ·
**Chef de projet** · **Chargé d'affaires** (masqué `<xl`) · Statut · actions.

- Montage = `affaires.date_montage` en format court (« 27 août ») + compte à rebours
  `J−n` / « Aujourd'hui » / `J+n` (gris si passé, atténué si > 60 j, ambre si ≤ 7 j).
- Démontage = `affaires.date_demontage`, format court, sans compte à rebours.
- Chef de projet / Chargé d'affaires : `chef_projet_id` / `charge_affaires_id` →
  `employes` (chargé en un seul SELECT, map `id → "Prénom N."`).
- La colonne « Période » (`date_debut → date_fin_prevue`) a été **retirée** (redondante).

## Tri
- Défaut : `date_montage` **croissant, nulls toujours en dernier** (quel que soit le sens).
- En-têtes cliquables : `numero`, `nom`, `client`, `montage`, `demontage`, `statut`.
  1er clic = asc, 2e = desc, flèche sur la colonne active.
- Persisté dans l'URL : `?tri=montage&sens=asc` (défauts strippés via `stripSearchParams`).

## Filtre échéance
Select « Montage dans… » : Toutes / 2 semaines (14 j) / 1 mois (31 j) / 3 mois (92 j) / **Sans date**.
Fenêtre = `[aujourd'hui, aujourd'hui + N]`. « Sans date » = `date_montage IS NULL`
(écran de rattrapage). Persisté dans l'URL (`?echeance=`).

## Indicateur
Sous les onglets de statut : « X affaires · Y sans date de montage ».
Y est cliquable → applique le filtre « Sans date ». Y est calculé sur `baseFiltered`
(tous les filtres SAUF l'échéance), pour rester stable quand le filtre est appliqué.

## Invariants
- Cap `requireCapability("section.affaires")` conservée.
- Filtres existants intacts : recherche texte, onglets statut, typologie multi-select,
  switch « Mes chantiers uniquement ».
- Tri et filtre échéance se composent (filtre d'abord, tri ensuite).
