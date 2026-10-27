# Lot 1 — Équipe projet, « Presque gagné », planning de pilotage

Principe : rien de bloquant, aucune suppression physique, migrations explicites et idempotentes, aucune publication sans accord.

## État vérifié
- Affaires : 88 avec chargé d'affaires, 16 avec chef de projet, 1 avec dessinateur ; toutes rattachables à un employé via `employes.profile_id`.
- Kevin Lebon : 68f44ab5 (avec compte) et d65ba705 (sans compte), tous deux actifs.
- Le Kanban opportunité utilise `affaires.statut_opportunite` (enum `opportunite_statut`).

## Migrations (dans l'ordre)
1. **0036_enum_presque_gagne** (seule, car un enum ajouté ne peut pas servir dans la même transaction) : `ALTER TYPE opportunite_statut ADD VALUE IF NOT EXISTS 'presque_gagne' BEFORE 'gagne'`.
2. **0037_roles_projet** :
   - enums `projet_role` (7 codes) et `referent_niveau` (principal, secondaire) ;
   - table `role_referents` (id, employe_id → employes, role, niveau, unique(employe_id, role)) ;
   - table `affaire_roles` (id, affaire_id → affaires, role, employe_id → employes, date_debut, date_fin, note, created/updated_at+by, unique(affaire_id, role)), trigger de validation date_fin ≥ date_debut (signal, pas CHECK sur now()) ;
   - colonne `affaires.statut_opportunite_depuis timestamptz` + trigger BEFORE UPDATE qui la remplit à chaque changement de statut ; backfill = `updated_at` pour les « presque gagné » existants (aucun aujourd'hui) ;
   - GRANTs (authenticated SELECT ; INSERT/UPDATE/DELETE soumis aux policies ; service_role ALL), RLS : lecture = `user_has_affaire_access` (affaire_roles) / tout authentifié (role_referents) ; écriture affaire_roles = `current_user_has_capability('affaires.edit')` + accès affaire ; écriture role_referents = admin. Policies restrictives OAuth identiques aux 7 tables MCP existantes (mcp_assert_legacy_oauth_write).
3. **0038_affaire_roles_sync** :
   - trigger AFTER INSERT/UPDATE/DELETE sur affaire_roles → met à jour `charge_affaires_id` / `chef_projet_id` (responsable_projet) / `dessinateur_id` (concepteur) avec `employes.profile_id` (NULL si pas de compte ou rôle retiré) ;
   - garde anti-boucle `pg_trigger_depth()` + trigger inverse sur affaires (colonnes historiques modifiées par l'ancien code → upsert affaire_roles), pour que pipeline, filtres « mes affaires » et Claude restent cohérents pendant la transition ;
   - backfill : INSERT INTO affaire_roles SELECT depuis les 3 colonnes via employes.profile_id (ON CONFLICT DO NOTHING).
4. **0039_referents_seed_kevin** (données de seed explicites, liste fournie) + fusion Kevin : réaffecter `d65ba705` → `68f44ab5` dans les 11 tables portant `employe_id` (absences, affaire_equipe, historique, assignations, employe_metiers, autorisations véhicules, fabrication_objet_equipe, heures_saisies, mission_events, divergence_log, staffing_plan_assignment) avec gestion des doublons sur les contraintes uniques (ligne en double conservée côté 68f44ab5), puis `actif=false` + note « fusionné ». Un comptage avant/après est fait et présenté avant d'appliquer.
5. **0040_pilotage** :
   - vue `v_charge_role_projet` (employe_id, role, nb_affaires_actives — exclut terminé/annulé/perdu), `security_invoker` ;
   - RPC `app_affecter_role_projet(affaire_id, role, employe_id, date_debut, date_fin, note)` SECURITY INVOKER, garde OAuth en tête, allow-list des champs ;
   - mise à jour explicite (relue) de `app_modifier_affaire` et `sign_opportunite` : les rôles restent sur la même affaire (même id), aucune perte ; retrait de la restriction dessinateur 6XXX ;
   - capability `planning.pilotage` (admin, chef, bureau_etude, commercial en lecture).

Le SQL complet de chaque migration est rédigé et montré avant application, sur relecture fraîche des définitions actuelles.

## Interface
- **labels.ts** : `PROJET_ROLE_LABELS`, `REFERENT_NIVEAU_LABELS`, libellé et info-bulle « Presque gagné ».
- **Paramètres > Référents par rôle** (admin) : matrice employés actifs × 7 rôles, cellule principal / secondaire / aucun, recherche par nom. Les pickers n'utilisent plus `profiles.est_*`.
- **Bloc « Équipe projet »** (fiche affaire + fiche opportunité, composant partagé) : un sélecteur cherchable par rôle, groupes Principaux / Secondaires / Autres employés actifs, compteur « Nadège – 4 en cours », dates pour concepteur et responsable projet, bouton « Planifier ». Rôles filtrés par `typologie_phases` (constructeur/finition si fabrication, montage/démontage si montage_demontage). Remplace `AffaireResponsablePicker` pour ces rôles.
- **Badges « rôle à affecter »** (fiche + carte Kanban) via helper pur `rolesManquants(statut, signé, typologie, roles)`.
- **Kanban** : colonne « Presque gagné » entre Envoyé et Gagné, info-bulle, badge si > 15 jours ; filtres, compteurs, tableur et exports mis à jour.
- **Planning > « Planning BE / projets »** : lignes = personnes groupées par rôle (concepteur, responsable projet), barres = affaires (numéro + nom + rôle) ; signé plein, gagné/presque gagné atténué, à faire/envoyé hachuré uniquement avec « Afficher la charge potentielle » et hors totaux ; horizon 1/3/6 mois, semaine courante, week-ends masquables ; clic = édition ; signal de chevauchement. Lecture `planning.pilotage`, édition `affaires.edit`. Onglets masqués inchangés.

## Connecteur Claude
- `fiche_affaire`, `rechercher_affaires` : `equipe_projet` (7 rôles, nom, date_debut, date_fin).
- Nouvelle écriture `affecter_role_projet` (aperçu → confirmation 10 min, audit, clé externe) via `app_affecter_role_projet`.
- Nouvelle lecture `planning_pilotage(du, au, role?, employe?)`.
- `presque_gagne` accepté dans `pipeline_opportunites` et `mettre_a_jour_opportunite`. Manifeste régénéré.

## Tests
- SQL (transaction annulée) : backfill 88/16/1, sync dans les deux sens, employé sans compte → colonne NULL, signature conserve les rôles, garde OAuth sur la RPC, fusion Kevin.
- Vitest : `rolesManquants` par statut/typologie, alerte 15 jours, compteur de charge, chevauchement planning, ordre des pickers, schémas MCP.

## Hypothèses à corriger si besoin
- Charge « active » = affaires non terminées/annulées/perdues, opportunités à faire/envoyé incluses.
- Un seul titulaire par rôle et par affaire (pas d'historique de remplacement dans ce lot).
- Chef finition/montage n'alimentent aucune colonne historique.
