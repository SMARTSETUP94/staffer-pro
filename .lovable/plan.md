## Objectif

Connecter `smart@setup.paris` (Microsoft 365) à l'app pour trier automatiquement les emails entrants en 3 catégories : **Candidatures**, **Opportunités**, **Pubs/Spam** — avec un mode review humain avant écriture en base.

---

## Architecture

```text
smart@setup.paris (Microsoft 365)
        │
        ▼
[Cron 5 min] → server route /api/public/hooks/poll-smart-inbox
        │
        ▼
[Microsoft Graph API via connecteur microsoft_outlook]
   - fetch messages inbox unread
        │
        ▼
[Lovable AI Gateway — Gemini 3 Flash, structured output Zod]
   - classifier: candidature | opportunite | pub | autre
   - extraction: poste visé / nom client / sujet / résumé
        │
        ▼
[Table emails_entrants] (statut: pending_review)
        │
        ▼
[Action Outlook] → archive systématique (déplace dossier "Archive")
        │
        ▼
[UI /inbox-smart] → review humain → validation
        │
        ├─► Crée candidature (table candidatures)
        └─► Crée opportunité (table opportunites + numéro auto)
```

---

## Périmètre fonctionnel

### 1. Connecteur Microsoft Outlook
- Lien OAuth `microsoft_outlook` (compte builder = boîte partagée `smart@setup.paris`)
- Scopes : `Mail.Read`, `Mail.ReadWrite` (pour archiver)

### 2. Polling toutes les 5 min
- `pg_cron` appelle `/api/public/hooks/poll-smart-inbox`
- Lit `inbox` non lus via Graph (`$filter=isRead eq false`)
- Pour chaque email → classification IA → insert dans `emails_entrants` → move vers `Archive`
- Marque comme lu

### 3. Classification IA (Lovable AI Gateway)
- Modèle : `google/gemini-3-flash-preview` (rapide, peu coûteux)
- Structured output Zod :
  ```ts
  { categorie: 'candidature'|'opportunite'|'pub'|'autre',
    confiance: number,
    poste_vise?: string,       // si candidature
    metier_devine?: string,    // mapping vers les 8 métiers Setup
    client_devine?: string,    // si opportunité
    typologie_devine?: '4XXX'|'5XXX'|'2XXXX',
    sujet_resume: string,
    contient_pj: boolean }
  ```

### 4. Table `emails_entrants`
Champs métier : `message_id_outlook` (unique), `from_email`, `from_name`, `subject`, `received_at`, `body_preview`, `body_html`, `attachments_count`, `categorie_ia`, `confiance_ia`, `metadata_ia` (jsonb), `statut` (`pending_review` / `validated` / `dismissed`), `validated_by`, `validated_at`, `candidature_id?`, `opportunite_id?`, `dismiss_reason?`.

RLS : admin + rh + chef commercial (cap `inbox_smart.view`).

### 5. Table `candidatures` (nouvelle)
Champs métier : `nom`, `prenom`, `email`, `telephone?`, `poste_vise`, `metier` (enum 8), `cv_url?` (Supabase Storage), `lettre_url?`, `source_email_id`, `statut` (`nouvelle` / `a_rencontrer` / `entretien` / `embauche` / `rejetee`), `notes`, `assignee_rh?`.

Tri/filtre par poste dans onglet dédié `/candidatures` (groupé par `metier` puis `poste_vise`).

### 6. Module Opportunités (existant)
- Réutilise table `opportunites` actuelle
- Numéro auto déjà géré côté DB (séquence existante)
- Bouton "Créer opportunité depuis email" pré-remplit : `objet`, `client`, `typologie` (déduite par IA), lien retour `source_email_id`.

### 7. UI

**Nouveau route `/inbox-smart`** (cap `inbox_smart.view` → admin + rh + commercial)
- 3 onglets : **À trier** (pending_review) / **Candidatures validées** / **Opportunités validées** / **Archivées (pub)**
- Tri par catégorie IA + badge confiance
- Sur chaque ligne : aperçu, PJ, boutons **Valider en candidature** / **Valider en opportunité** / **Marquer pub** / **Ignorer**

**Page `/candidatures`** (cap `candidatures.view` → admin + rh)
- Tableau filtré par métier (sidebar) + recherche
- Sheet détail : CV, lettre, historique emails, statut, notes
- Bouton "+ Candidature manuelle" pour saisie hors email

**Onglet "Emails" sur fiche opportunité** : liste des emails liés (lecture seule).

### 8. Pièces jointes
- Téléchargées via Graph (`/messages/{id}/attachments`)
- Uploadées vers bucket Storage privé `candidatures-pj` ou `opportunites-pj`
- Signed URLs

### 9. Mode review (toggle par admin)
- Setting global `inbox_smart_auto_validate` (default `false`)
- Si `false` : tout va en `pending_review`
- Si `true` : auto-création si `confiance > 0.85`, sinon pending

---

## Capabilities ajoutées
- `inbox_smart.view` → admin, rh, chef (commercial)
- `candidatures.view` → admin, rh
- `candidatures.manage` → admin, rh

---

## Sprint découpé

| # | Lot | Description |
|---|-----|-------------|
| 1 | **Connecteur + secret** | Connect Microsoft Outlook, vérifier scopes Mail.ReadWrite |
| 2 | **Schéma DB** | Tables `emails_entrants` + `candidatures` + buckets Storage + RLS + caps |
| 3 | **Server route polling** | `/api/public/hooks/poll-smart-inbox` (Graph fetch + classifier IA + insert + archive) |
| 4 | **Cron pg_cron** | Job 5 min appelant le hook |
| 5 | **UI `/inbox-smart`** | 4 onglets, validation, mapping vers candidature/opportunité |
| 6 | **UI `/candidatures`** | Liste tri par poste, sheet détail, CRUD |
| 7 | **Onglet Emails fiche opportunité** | Lecture seule + lien retour |
| 8 | **Sidebar + routing** | Items capability-driven |
| 9 | **Tests E2E** | role-smoke + happy path candidature + opportunité |

Estimation : 2–3 jours de dev itératif (sprint séquencé lot par lot avec validation visuelle entre chaque).

---

## Points d'attention

- **Boîte partagée Microsoft 365** : le connecteur OAuth se fait avec UN compte. Si `smart@setup.paris` est une vraie boîte (pas un alias), un admin Microsoft doit s'y connecter pour autoriser. Si c'est une boîte partagée, il faut un compte délégué.
- **RGPD candidatures** : conserver max 2 ans (dette à ajouter), purge auto via cron mensuel.
- **Quota Graph** : 10 000 req/10 min/app → largement suffisant à 5 min de polling.
- **Coût IA** : ~0.001 €/email classifié Gemini Flash → négligeable.
- **Idempotence** : `message_id_outlook` UNIQUE empêche les doublons si le cron rejoue.

---

## Questions résiduelles avant de coder

1. **`smart@setup.paris` = boîte partagée Microsoft 365 ou boîte nominative** ? (impacte la procédure OAuth)
2. **Postes candidatures** : on réutilise la table `postes_catalogue` existante (8 postes seed) ou on laisse libre texte au début ?
3. **CV/PJ candidatures** : qui peut voir ? (admin + rh seulement, ou aussi chef d'équipe quand l'embauche est faite ?)
4. **Pubs détectées** : on les supprime définitivement de la boîte ou on les laisse archivées ?

Une fois les réponses confirmées, je commence par le **Lot 1 (connecteur)** + **Lot 2 (schéma DB)** dans la même passe.