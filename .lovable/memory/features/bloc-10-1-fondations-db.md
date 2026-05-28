---
name: Bloc 10.1 Fondations DB Opportunités
description: Tables opportunite_actions + opportunite_jalons, RPC sign_opportunite atomique 9XXX→5XXX, 4 caps create/edit/delete/read.mine, seed 196 opps × 4 jalons
type: feature
---

Bloc 10.1 livré le 28 mai 2026. Opportunités vivent toujours dans `affaires` (phase='opportunite', numero=9XXX). Enrichissement par 2 tables + RPC.

## Tables

- `opportunite_actions` — timeline d'actions commerciales (10 types via enum `opp_action_type` : email_envoye/recu, rdv_planifie/realise, relance_tel/email, note_interne, devis_envoye, echantillon_presente, autre). Champs : auteur_id (→profiles), texte, prochaine_action_due_le, attachments jsonb.
- `opportunite_jalons` — pipeline 4 étapes (enum `opp_jalon_etape` : qualification, devis_envoye, negociation, signature). UNIQUE(affaire_id, etape). Champs : date_prevue, date_atteinte, ordre, notes.

## RLS

Scope basé sur `affaires.charge_affaires_id = auth.uid()` :
- SELECT : `opportunites.read.all` OR (`opportunites.read.mine` AND charge_affaires=user)
- INSERT/UPDATE : `action.edit_opportunite` + scope
- DELETE actions : `action.delete_opportunite` (admin only)
- jalons modify : policy ALL combinée

## 4 nouvelles caps

| key | admin | commercial | chef_chantier |
|---|---|---|---|
| action.create_opportunite | all | own | all |
| action.edit_opportunite | all | own | all |
| action.delete_opportunite | all | — | — |
| opportunites.read.mine | all | own | all |

## RPC `sign_opportunite(_affaire_id uuid)`

SECURITY DEFINER. Vérifie cap `action.sign_opportunite`. FOR UPDATE sur affaires + advisory lock `hashtext('sign_opportunite_5xxx')` pour sérialiser. Calcule prochain 5XXX libre (MAX+1, plafond 5999). UPDATE phase='signe', numero=5XXX, signed_at=now(), statut_opportunite=NULL (respect CHECK `affaires_phase_statut_coherence`). Met à jour jalon `signature.date_atteinte`. Log entrée `opportunite_actions` type='autre' texte='Opportunité signée — code 9XXX → 5XXX'.

GRANT EXECUTE TO authenticated.

## Seed initial

784 lignes `opportunite_jalons` (196 opps × 4 jalons) créées idempotemment (ON CONFLICT DO NOTHING).

## Audit Risque #1 (à transmettre Gabin)

Les 196 opps existantes ont TOUTES `statut_opportunite='termine'` (dates nov 2025 → sept 2026, dont 13 récentes 30j). 191/196 ont `charge_affaires_id=NULL`. Soit import legacy à archiver, soit bug d'import à investiguer. Décision attendue avant Bloc 10.2 listing.

## Tests pgTAP

- `supabase/tests/sign_opportunite_race.spec.sql` (3 assertions : 5XXX valide, 2 numéros distincts, throw si déjà signé)
- `supabase/tests/opportunite_actions_rls.spec.sql` (3 assertions : CA voit own, CA ne voit pas autres, admin voit tout)

Exécutés en CI via workflow sql-tests.yml.
