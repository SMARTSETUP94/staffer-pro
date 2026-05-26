---
name: bloc-10-fiche-opportunite-analyse
description: Note d'analyse Bloc 10 — Fiche opportunité commerciale (DB, RPC, composants, scope ajusté, estimation)
type: feature
---

# Bloc 10 — Fiche opportunité commerciale (note d'analyse)

Date : 26 mai 2026. Statut : pré-implémentation (note posée, code à venir après validation Gabin du test 9.6 bis).

## 1. Investigation DB

### Table `affaires` — champs commerciaux déjà présents ✅
Pas besoin de re-créer le socle opportunité, il existe déjà :
- `phase` enum `affaire_phase` = `opportunite | signe` (default `signe`)
- `statut_opportunite` enum `opportunite_statut` = `a_faire | envoye | gagne | perdu | termine`
- `code_opportunite text` (le 1XXX/3XXX d'origine, sauvegardé après signature)
- `numero text` (passe de 1XXX/3XXX → 5XXX au moment de la signature)
- `date_opportunite date`
- `signed_at timestamptz`
- `chef_projet_id uuid`, `charge_affaires_id uuid`
- `taille` enum (S/M/L… déjà utilisé par Kanban)
- `typologie_future text` (typologie projetée avant signature)
- `date_pat date` (présentation au client)
- `date_evenement_debut / fin date`
- `acces_livraison`, `code_acces`, `consignes_tenue`, `contact_site_nom`, `contact_site_tel` (déjà ajoutés au Bloc 9.3 via `AffaireInfosPoseSection`)

### Champs commerciaux manquants (à ajouter)
- `prochaine_action_text text`
- `prochaine_action_date date`
- `prochaine_action_assignee_id uuid` (employes.id)
- `proba_signature smallint` (0–100, optionnel)
- `valeur_estimee_centimes bigint` (devis estimatif avant chiffrage, optionnel)

→ **1 seule migration**, ALTER TABLE additif, pas de risque sur les 295 affaires existantes (99 signées + 196 opportunités terminées).

### Tables liées à créer
- `affaires_visites` : visite de site (date, contact rencontré, compte-rendu, photos via storage, geo opt.)
- `affaires_echantillons` : référence matériau / finition prélevée (nom, fournisseur, ref, prix, photo)
- `affaires_artefacts` : moodboard / esquisse / fichier libre (storage_path, type enum `moodboard|esquisse|inspiration|autre`, légende)

Convention de nommage : préfixe `affaires_*` (PAS `opportunites_*`) car une opportunité = `affaires` en phase `opportunite`. Les artefacts restent attachés après signature → cohérence durable.

RLS pattern identique à `affaire_documents` : chef_or_admin OU `user_has_affaire_access(affaire_id)` OU `user_is_mentioned_on_affaire(affaire_id)`. GRANT authenticated + service_role obligatoires (voir `<public-schema-grants>`).

### Table `opportunites_imports` existante
Déjà en place pour ingestion CSV. Non touchée par Bloc 10.

## 2. RPC existantes à enrichir

### `sign_opportunite(_affaire_id, _new_code)` ✅ existe
Comportement actuel :
- Vérifie phase=opportunite + statut=gagne + code 5XXX
- Bascule numero ↔ code_opportunite, phase=signe, statut_opportunite=NULL, statut=en_cours

**Enrichissements Bloc 10** :
- Conserver l'équipe `affaire_equipe` phase `commercial_etude` (déjà conservée car même affaire_id — vérifier qu'aucun trigger ne purge)
- Émettre notification `chef_atelier_assigne` au chef d'atelier (récupérer via `chef_chantier_id` ou settings global) — réutiliser table `notifications` (helper `notify` détecté au 9.1)
- Optionnel : logger un `mission_events` ou `journal_affaire` entry "Signature 5905 (ex 1234)"

### RPC nouvelles à créer
- `add_visite_chantier(affaire_id, visite_data jsonb)` — SECURITY DEFINER, check chef_or_admin OR mentioned
- `add_echantillon(affaire_id, ...)`
- `upload_artefact(affaire_id, artefact_data)` — l'upload storage se fait côté client, la RPC enregistre la ligne

Ces RPC peuvent rester de simples INSERT côté server fn (pas besoin de SECURITY DEFINER si RLS bien posée). **Décision : server fn pures, pas de RPC**, sauf si garde-fou métier (ex : interdire visite après signature → check côté server fn).

## 3. Composants existants à réutiliser

- `src/components/opportunites/OpportuniteCard.tsx` (185 lignes) — carte Kanban, source du header de fiche
- `src/components/opportunites/KanbanColonne.tsx` (80 lignes)
- `src/components/opportunites/NouvelleOpportuniteDialog.tsx` (251 lignes) — formulaire création
- `src/components/opportunites/OpportunitesTableurView.tsx` (927 lignes) — vue tableur enrichie
- `src/components/opportunites/SignerOpportuniteDialog.tsx` (245 lignes) — flow signature 5XXX
- `src/routes/_app.opportunites.tsx` (662 lignes) — Kanban + vue tableur switcher
- `src/components/affaire/AffaireInfosPoseSection.tsx` (Bloc 9.3) — pattern d'édition inline des 5 infos pose
- `NotificationBell` + table `notifications` + helper notify (Bloc 9.1)

**Pas de fiche opportunité dédiée aujourd'hui** : un click sur une carte Kanban navigue probablement vers `/affaires/$id` (à confirmer en lisant `_app.opportunites.tsx`), mais cette route est calibrée pour les chantiers signés (devis, casting, fabrication…) et n'a pas de section commerciale dédiée (brief, visites, échantillons, moodboard, journal commercial).

## 4. UI cible Bloc 10

### Route nouvelle
`src/routes/_app.opportunites.$affaireId.tsx` — fiche opportunité dédiée (ne pas réutiliser `_app.affaires.$affaireId.tsx` qui est orienté chantier signé).

### Sections de la fiche
1. **Header** : numero (1XXX/3XXX) + client + lieu + statut Kanban + bouton "Signer en 5XXX" (dialog existant)
2. **Next Step** card : `prochaine_action_text / date / assignee` éditable inline, badge rouge si date passée
3. **Brief client** : `nom`, `lieu`, `typologie_future`, `taille`, `date_pat`, `date_evenement_debut/fin`, `proba_signature`, `valeur_estimee_centimes`, `notes` — éditable inline (pattern AffaireInfosPoseSection)
4. **Équipe commercial_etude** : reuse `affaire_equipe` filtré phase=`commercial_etude` (composant CastingPhaseBlock existant)
5. **Visites chantier** : liste cards + dialog "Nouvelle visite" + photos
6. **Échantillons** : grille cards + dialog ajout
7. **Moodboard / esquisses** : galerie storage + drop zone (artefacts)
8. **Devis brouillons** : reuse table `devis` filtrée par affaire_id (déjà existante)
9. **Journal commercial** : reuse `affaire_commentaires` (déjà existante, RLS OK pour mentions)

### Mobile (V1 optionnel — recommandé V2)
`mobile.opportunite.$affaireId.visite.tsx` — formulaire "Nouvelle visite chantier" (date auto, contact, compte-rendu vocal/texte, photos via input camera). Réutilise `image-compress.ts` (Bloc 9.1). **Estimation ~4h. À sortir du V1** pour rester sous 40h.

## 5. Server functions

À créer dans `src/server/opportunite.functions.ts` :
- `getOpportuniteFullData(affaireId)` — agrège : affaire + équipe + visites + échantillons + artefacts + devis brouillons + commentaires + next_action
- `updateOpportuniteFields(affaireId, patch)` — patch partiel des champs commerciaux (next_action, brief, proba, valeur)
- `addVisite(affaireId, payload)` + `updateVisite` + `deleteVisite`
- `addEchantillon` + CRUD
- `uploadArtefact(affaireId, metadata)` — l'upload storage côté client, la fn écrit la ligne
- `transferOpportuniteToAffaire(affaireId, newCode)` — wrapper enrichi de `sign_opportunite` RPC : appelle la RPC + envoie notification chef atelier + log journal

Tous gated `requireSupabaseAuth` + check chef_or_admin OU mentioned via `user_is_mentioned_on_affaire`.

## 6. Tests

- Vitest : `opportunite-helpers.test.ts` (calcul proba/valeur, validation prochaine_action)
- E2E : `opportunite-fiche.spec.ts` (création visite + échantillon + transfert en 5XXX + vérification notif chef atelier)
- E2E mobile (si V1 mobile gardé) : `nouvelle-visite.poseur.spec.ts`

## 7. Estimation détaillée (révisée)

| Lot | Scope | Heures |
|---|---|---|
| 10.1 | Migration DB : 5 champs + 3 tables + RLS + GRANTs | 3h |
| 10.2 | Server fn `getOpportuniteFullData` + `updateOpportuniteFields` | 4h |
| 10.3 | Route + skeleton fiche + Header + Brief éditable + NextStep | 6h |
| 10.4 | Section Visites (CRUD + UI + storage photos) | 5h |
| 10.5 | Section Échantillons (CRUD + UI) | 4h |
| 10.6 | Section Moodboard/Artefacts (storage + galerie) | 5h |
| 10.7 | Journal commercial (reuse `affaire_commentaires`) + équipe + devis brouillons (reuse) | 3h |
| 10.8 | Enrichissement `transferOpportuniteToAffaire` (RPC + notif chef atelier + log) | 3h |
| 10.9 | Lien Kanban → fiche + nav AppSidebar/mobile | 1h |
| 10.10 | Tests Vitest + 1 E2E desktop | 4h |
| 10.11 | Mobile "Nouvelle visite" + 1 E2E (OPTIONNEL V1) | 4h |
| **Total V1 sans mobile** | | **38h** |
| **Total V1 avec mobile** | | **42h** |

→ **Estimation initiale 40h confirmée.** Sortir le mobile en V2 pour rester dans le budget si charge tendue.

## 8. Points d'attention / risques

1. **Bascule numero ↔ code_opportunite**: la RPC `sign_opportunite` mute `numero`. Toutes les FK qui pointent sur `affaire_id` (UUID) sont OK — aucune logique applicative ne doit indexer sur `numero`. **À auditer** : vérifier que `mission_events.affaire_id` et autres FK sont bien UUID et pas une recherche `WHERE numero = ...`.
2. **Équipe commercial_etude post-signature** : confirmer qu'aucun trigger sur `affaires.phase` ne purge `affaire_equipe` (probabilité faible mais à vérifier en lisant migrations).
3. **Statut Kanban `gagne` vs phase `signe`** : 196 affaires actuellement en phase=opportunite + statut=termine. Clarifier avec Gabin si `termine` = abandonné post-signature OU = workflow legacy à archiver. Impact sur affichage Kanban.
4. **Notifications chef d'atelier** : pas de paramètre global `chef_atelier_id` aujourd'hui. Options : (a) settings/paramètres entreprise nouvelle ligne, (b) tous les `has_role('admin')`, (c) un rôle `atelier_chef` existe déjà (vu dans RLS `fab_photos_insert_authorized`) → préférer **(c)** : notifier tous les `atelier_chef`.
5. **Storage buckets** : créer bucket `affaires-artefacts` (private) + policies pour visites/échantillons. Ou réutiliser `affaire-documents` avec categorie `visite|echantillon|moodboard` → **préférer réutilisation**, économie d'infra.

## 9. Décision storage

**Réutiliser `affaire_documents`** avec :
- `categorie ∈ {photo_visite, echantillon, moodboard, esquisse_commerciale}`
- `mission_phase = 'commercial_etude'` (ou nouveau `commercial`)
- Pas besoin de 3e tables `affaires_artefacts` distincte — économise 1 migration + 1 set de RLS.

**Tables réellement nouvelles** :
- `affaires_visites` (date, contact, compte-rendu, geo) — métadonnées riches → table dédiée justifiée
- `affaires_echantillons` (référence matériau, fournisseur, prix) — métadonnées spécifiques → table dédiée justifiée

→ **2 tables nouvelles au lieu de 3.** Économie ~1h sur 10.1.

## 10. Plan d'exécution proposé

Ordre des lots :
1. 10.1 migration (3h) → bloc DB validé avant code
2. 10.2 server fn agrégateur (4h)
3. 10.3 + 10.7 squelette fiche + reuse devis/journal (8h) — fiche utilisable mais sans visites/échantillons
4. 10.4 + 10.5 + 10.6 (14h) — modules métier ajoutés
5. 10.8 + 10.9 (4h) — signature enrichie + nav
6. 10.10 tests (4h)
7. 10.11 mobile (à arbitrer, +4h)

**Checkpoint après 10.3** : Gabin valide la fiche minimale avant qu'on dépense les 14h modules.

## 11. Roadmap post-Bloc 10

- Polish Bloc 8 reste (~15h)
- Approfondissement Planning fab (à scoper avec Gabin)
- Mini-sprint dette tests pré-existants (1-2h)

GO/NO-GO Bloc 10 attendu après validation terrain Gabin du Bloc 9.6 bis.
