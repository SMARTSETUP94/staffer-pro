# Schéma base de données — Index humain

**Source de vérité machine** : `src/integrations/supabase/types.ts` (auto-généré).
**Cet index** : vue par domaine fonctionnel pour onboarding et navigation rapide.
**Dernière mise à jour** : 10 mai 2026 (v0.44.6).

---

## Auth & RH

| Table | Rôle |
|---|---|
| `profiles` | Profil applicatif (1:1 `auth.users`). Pas de rôles ici. |
| `user_roles` | Rôles app (`admin`, `chef_chantier`, `employe`, `chef_metier_scoped`). Source autorité RLS. |
| `employes` | Fiche RH (contrat, métier, taux, poste_principal). 162 fiches prod. |
| `employes_competences` | Niveaux compétence 4 niveaux (P/S/D/X) × métier. |
| `absences` | Congés validés/en attente. Slots AM/PM/JOURNEE. |
| `postes_catalogue` | Catalogue 8 postes intermittents (v0.42.1). |

## Affaires & Devis

| Table | Rôle |
|---|---|
| `affaires` | Chantier. `numero` détermine typologie (1XXX, 4XXX, 5XXX…). |
| `affaire_chefs` | Assignation chef ↔ affaire. |
| `affaire_documents` | Photos / documents chantier. Soft-delete `deleted_at` + `deleted_by`. |
| `affaire_commentaires` | Journal commentaires. |
| `devis` | Devis import Progbat. UNIQUE par fichier_hash. |
| `devis_objets` | Lignes devis hiérarchiques. |
| `devis_deletion_log` | Audit cascade delete devis. |
| `opportunites` | Pipeline avant affaire. |

## Staffing & Planning

| Table | Rôle |
|---|---|
| `plans_chantier` | Plan staffing par affaire. Versioning + publication. |
| `plans_chantier_versions` | Historique snapshots restorables. |
| `assignations` | Liens plan × employé × jour. `presence_pct`, `span_demi_jours`, `start_half_day`. |
| `fabrication_objets` | Objets à fabriquer (UNIQUE `affaire_id, reference`). |
| `fabrication_etapes` | Étapes Kanban Atelier. |
| `fabrication_objets_photos` | Photos objet. Soft-delete. |

## Heures & Validation

| Table | Rôle |
|---|---|
| `heures_saisies` | Saisies employé/affaire/jour. Statuts `brouillon`/`a_valider`/`valide`/`rejete`. |
| `heures_validations` | Audit trail validation chef (append-only). |
| `mes_affaires_chef` | Vue scopée chef pour RLS. |

## Contrats Intermittents

| Table | Rôle |
|---|---|
| `contrats_intermittents` | Contrat CDDU. |
| `contrat_templates` | Templates versionnés TipTap. |
| `contrats_signatures` | Log signatures (immuable, `signed_at` forcé server-side v0.44.5). |

## Audit & Logs

| Table | Rôle |
|---|---|
| `audit_log` | Journal global mutations sensibles. |
| `incident_auth_log` | Tentatives auth suspectes. |
| `devis_imports` | Historique imports + hash anti-doublon. |
| `v_documents_supprimes_30j` | Vue admin 30 derniers soft-deletes. |

## Helpers RLS (`SECURITY DEFINER`, ne JAMAIS REVOKE EXECUTE)

- `is_admin()`
- `is_chef_or_admin()`
- `has_role(_user_id, _role)`
- `user_has_affaire_access(_affaire_id)`
- `current_user_is_chef_on_affaire(_affaire_id)`
- `user_is_mentioned_on_affaire(_affaire_id)`
- `is_devis_termine(_devis_id)`
- `can_saisie_on_affaire(_affaire_id, _date)`

## Triggers business (v0.44.3+)

- `validate_heures_saisies_bounds` — `heures_reelles`/`heures_nuit` ∈ [0,24], nuit ≤ réelles → `HEURES_INVALIDES`.
- `validate_assignation_heures` — `heures` ∈ [0,24] → `HEURES_INVALIDES`.
- `validate_contrat_intermittent` — `date_fin ≥ date_debut`, `taux_horaire_brut > 0` → `DATES_CONTRAT_INVALIDES` / `TAUX_INVALIDE`.
- `enforce_signed_at_server_side` (v0.44.5) — Force `signed_at = now()` sur `contrats_signatures` INSERT.

## Buckets Storage

| Bucket | Public | TTL signed URL |
|---|---|---|
| `affaires-photos` | privé | 1h |
| `fabrication-photos` | privé | 1h |
| `affaire-attachments` | privé | 60s |
| `contrats-intermittents` | privé | 1 an (dette : à refactorer signed-on-demand) |
| `avatars` | privé | 1 an |
| `feedback` | privé | 1h |
