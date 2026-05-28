## Bloc 10.3 — Fiche opportunité enrichie (~8h)

### Contexte
- Bloc 10.1 a livré `opportunite_actions` (timeline) + `opportunite_jalons` (pipeline 4 étapes) + RPC `sign_opportunite` atomique.
- Bloc 10.2 a archivé les 191 + 5 opps orphelines et étendu `get_inbox_items` avec source `opp_action`.
- Aujourd'hui, un clic sur une carte Kanban renvoie vers `/affaires/$id` (orienté chantier signé) → manque une fiche dédiée commerciale.

### Périmètre 10.3 (strict, 8h)

**Route nouvelle** : `src/routes/_app.opportunites.$affaireId.tsx` (cap `section.opportunites` ; scope `mine` filtré par `charge_affaires_id` si pas `opportunites.read.all`).

**Server functions** (`src/server/opportunite-fiche.functions.ts`) :
- `getOpportuniteFiche(affaireId)` → agrège affaire + jalons + dernières actions (10) + équipe `commercial_etude` + devis brouillons + commentaires.
- `updateOpportuniteFields(affaireId, patch)` → patch partiel (`nom`, `client`, `lieu`, `typologie_future`, `taille`, `date_pat`, `date_evenement_debut/fin`, `notes`).
- `addOpportuniteAction(affaireId, payload)` → INSERT timeline (type, date, commentaire, prochaine_action_due_le, assignee_id).
- `updateJalonStatus(affaireId, jalon_code, status)` → UPDATE `opportunite_jalons`.

**Composants** (`src/components/opportunites/fiche/`) :
1. `OpportuniteFicheHeader` — numéro/code, client, lieu, taille, statut Kanban, bouton « Signer en 5XXX » (réutilise `SignerOpportuniteDialog`).
2. `OpportuniteJalonsBar` — pipeline 4 étapes (qualification → devis → négociation → signature), badge statut + cap-gated click pour avancer.
3. `OpportuniteNextActionCard` — dernière `opportunite_actions` avec `prochaine_action_due_le`, badge rouge si date passée, bouton « Ajouter action ».
4. `OpportuniteBriefSection` — édition inline 9 champs (pattern `AffaireInfosPoseSection`).
5. `OpportuniteActionsTimeline` — liste chronologique des actions (icônes par type : appel/visite/email/réunion/devis).
6. `OpportuniteEquipeSection` — réutilise lecture `affaire_equipe` phase `commercial_etude`.
7. `OpportuniteDevisSection` + `OpportuniteJournalSection` — reuse `devis` + `affaire_commentaires` (composants lecture simple).

**Sortie de scope 10.3** (reportés à 10.4/10.5/10.6) :
- Visites chantier (table dédiée + photos)
- Échantillons matériaux
- Moodboard / artefacts storage
- UI mobile « nouvelle visite »

**Nav** : `OpportuniteCard` (Kanban) + `OpportunitesTableurView` (ligne) → lien vers `/opportunites/$affaireId`.

### Tests
- 1 spec Vitest sur helpers tri timeline + agrégation jalons.
- 1 spec E2E desktop (admin) : ouvrir fiche, éditer brief, ajouter action, vérifier inbox `opp_action`.

### Livrables
- 1 route + 7 composants + 1 server fn file (4 fns)
- 2 specs (1 Vitest + 1 E2E)
- Update `_app.opportunites.tsx` (lien Kanban + tableur)
- Memory `bloc-10-3-fiche-ui.md`

### Hors scope (à confirmer)
Pas de migration DB cette fois (10.1 a tout posé). Si tu veux des champs `proba_signature` ou `valeur_estimee_centimes` sur l'opp, je les ajoute en 10.3-bis (15 min ALTER).

**OK pour partir sur ce périmètre, ou tu veux ajuster (sections supplémentaires, mobile, champs proba/valeur, etc.) ?**
