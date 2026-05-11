---
name: Historique équipe par chantier
description: Table agrégée affaire×chef×employé alimentée par trigger temps réel, support feature "Mon équipe type" et future IA
type: feature
---

# v0.45 — `affaire_equipe_historique`

## Quoi
Table d'agrégat (1 ligne par `affaire × chef × employé`) dérivée d'`assignations`. Sert :
- traçabilité rapide (qui a bossé avec qui sur quel chantier)
- feature store pour suggestions IA futures (auto-staffing contextuel client/typologie/chef)
- widget dashboard "Mon équipe type"

## Schéma
- `affaire_id`, `affaire_numero`, `client`, `typologie` (snapshot), `phase`, `affaire_statut`, `affaire_cloturee`
- `date_debut_affaire`, `date_fin_affaire`
- `chef_id` (employes.id), `chef_role` ('chef_chantier' | 'responsable_montage' | 'responsable_demontage' | 'chef_projet' | 'charge_affaires')
- `employe_id`, `metier_principal_id`, `type_contrat`
- `nb_demi_jours`, `nb_jours_distincts`, `premier_jour`, `dernier_jour`
- `presence_pct_moyen`, `a_refuse`, `a_ete_absent`
- `derniere_assignation_at`
- UNIQUE `(affaire_id, chef_id, chef_role, employe_id)`

## Alimentation
**Trigger temps réel** :
- `trg_aeh_assignations` AFTER INSERT/UPDATE/DELETE sur `assignations` → appelle `refresh_affaire_equipe_historique(affaire_id)`
- `trg_aeh_affaires` AFTER UPDATE sur `affaires` si client/numero/statut/phase/chefs/dates changent

**Fonction** `refresh_affaire_equipe_historique(uuid)` SECURITY DEFINER : DELETE + INSERT agrégé. Self-exclusion (un chef ne se compte pas comme membre de sa propre équipe).

**Backfill initial** appliqué dans la migration via `DO $$ FOR DISTINCT affaire_id ... LOOP`.

## Sécurité
RLS SELECT : `is_chef_or_admin()` OU employé concerné OU `user_has_affaire_access(affaire_id)`. Aucune écriture client (maintenu par trigger SECURITY DEFINER).

## RPC `get_mon_equipe_type(_typologie, _limit, _months)`
SECURITY DEFINER + STABLE. Résout `auth.uid()` → `employes.id` → top coéquipiers par score.

Score = `nb_chantiers × 2 + ln(total_demi_jours+1) × 3 + bonus_fraicheur`. Exclut employés inactifs et collaborations terminées par refus.

## Widget `mon_equipe_type`
- Catégorie `perso`, width 1
- Whitelist : admin + `chef_chantier` + `chef_metier_scoped`
- Filtre typologie (all/montage_demontage/fabrication/stockage/prototype/non_operationnel)
- Top 8 sur 12 mois glissants

## Réutilisation IA future (v0.41)
La table sert de feature store : *"Pour ce chef + cette typologie + ce client, voici les N employés avec leurs stats de présence/refus/fréquence."* → prompt context pour Claude/Gemini.
