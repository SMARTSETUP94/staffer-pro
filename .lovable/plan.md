# Fiche Client centralisée + auto-matching email

## Objectif
Centraliser les clients dans une table dédiée pour qu'un même client (ex: EDF) regroupe toutes ses affaires (4XXX/5XXX/9XXX), ses contacts et ses emails entrants — au lieu d'être éparpillé via le texte libre `affaires.client`.

## Modèle de données

### Table `clients`
- `id` uuid PK
- `nom` text (unique, normalisé)
- `nom_affichage` text (libellé propre)
- `domaine_email` text[] (ex: `['edf.fr','edf.com']`) — clé d'auto-matching
- `siret` text nullable
- `secteur` text nullable
- `notes` text nullable
- `actif` boolean default true

### Table `client_contacts`
- `id` uuid PK
- `client_id` uuid FK → clients
- `nom`, `prenom`, `email` (unique par client), `telephone`, `fonction`
- `notes`, `actif`

### FK ajoutée
- `affaires.client_id` uuid nullable → clients (la colonne `client` text reste pour compat / affichage rapide, synchronisée par trigger)
- `emails_entrants.client_id` uuid nullable + `emails_entrants.contact_id` uuid nullable

### Auto-matching email (DB trigger)
Fonction `match_email_to_client(from_email)` SECURITY DEFINER :
1. Extrait le domaine de `from_email`
2. SELECT client dont `domaine_email` contient ce domaine
3. Crée/retrouve un `client_contacts` pour cette adresse
4. Renseigne `client_id` + `contact_id` sur `emails_entrants`

Trigger BEFORE INSERT sur `emails_entrants` qui appelle ce helper.

### Backfill
- Script SQL : DISTINCT `affaires.client` → INSERT dans `clients` (1 client par variante orthographique, à fusionner ensuite via UI admin)
- UPDATE `affaires.client_id` par join sur nom normalisé
- Pour chaque email existant : tenter le match par domaine

### RLS
- `clients` / `client_contacts` : SELECT pour `is_chef_or_admin()` + commercial (charge_affaires sur une affaire du client)
- WRITE : `is_chef_or_admin()` uniquement

## UI

### Nouvelle route `/clients` (liste)
- Tableau : Nom · Domaine(s) · # Affaires · # Opportunités actives · # Contacts · Dernier email reçu
- Recherche + filtre actif/inactif
- Bouton « Nouveau client »

### Nouvelle route `/clients/$clientId` (fiche)
Header : nom, domaines, secteur, SIRET + bouton Éditer
4 onglets :
1. **Affaires** : toutes les `affaires` du client groupées par typologie (5XXX fab, 4XXX montage, 9XXX opportunités, autres). Lien vers chaque fiche.
2. **Contacts** : liste éditable (CRUD inline) des `client_contacts`. Bouton « + Contact ».
3. **Emails** : derniers emails entrants rattachés au client (chrono desc), avec statut/catégorie IA, lien vers `/inbox-smart` filtré.
4. **Notes** : zone libre + log activité (créations affaires, derniers emails).

### Module admin de fusion de doublons
- Page `/clients/admin/fusion`
- Liste les clients avec nom similaire (similarité pg_trgm `nom %% nom`)
- Bouton « Fusionner » : déplace toutes les affaires/emails/contacts du doublon vers le canonique, supprime le doublon

### Lien depuis l'Inbox Smart
- Carte email affiche le badge client matché si présent
- Dialog email : section « Client » avec lien vers /clients/$id

### Lien depuis fiche Affaire
- Champ `client` (texte) remplacé par un sélecteur Client (combobox avec recherche, bouton « Nouveau client »)
- Lien cliquable vers la fiche client

## Lots de livraison

**Lot 1 — Socle DB** (1 migration)
- Tables `clients` + `client_contacts` + FK + RLS + trigger auto-match + backfill depuis `affaires.client` distinct

**Lot 2 — Pages listing + fiche**
- `/clients` liste
- `/clients/$id` avec 4 onglets

**Lot 3 — Wiring Inbox Smart + Affaires**
- Badge client sur carte email + section dans dialog
- Combobox client sur création/édition affaire

**Lot 4 — Admin fusion doublons**
- Page `/clients/admin/fusion` avec pg_trgm

## Détails techniques

- Capabilities nouvelles : `clients.view` (admin + chef + commercial), `clients.manage` (admin + chef), `clients.merge` (admin)
- Sidebar : entrée « Clients » sous le hub commercial
- Server functions : `getClientDetails(clientId)` (agrège affaires/contacts/emails), `mergeClients(sourceId, targetId)` SECURITY DEFINER
- Index : `clients(nom)`, `client_contacts(email)`, `affaires(client_id)`, `emails_entrants(client_id, received_at DESC)`
- Trigger `match_email_to_client` non bloquant (si pas de match, `client_id` reste NULL — l'email reste accessible)

## Mémoire à créer
`mem://features/clients-hub` — Modèle 1 client → N affaires/contacts/emails, auto-match par domaine, fusion via admin.

## Hors scope V1
- Synchro CRM externe (HubSpot/Salesforce)
- Stats financières par client (CA, marge)
- Notifications « nouveau client détecté »
