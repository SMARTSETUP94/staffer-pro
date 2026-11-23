# Transfert des devis vers Pennylane — plan (rien appliqué)

## Constat
- 5 devis Staffing au statut « signé » aujourd'hui ; **aucun client n'a d'identifiant Pennylane** → le rapprochement des clients est un préalable.
- Le transfert ProGBat reste en place, inchangé.
- Secret `PENNYLANE_API_TOKEN` absent : Gabin l'ajoute lui-même dans Paramètres du projet → Secrets.

## Parcours
1. **Rapprochement clients** (une fois, puis au fil de l'eau) — admin + commercial.
2. **Sur un devis signé** : bouton « Transférer vers Pennylane » → fenêtre options retenues → récapitulatif → transfert.
3. **Après** : lien « Ouvrir le devis dans Pennylane » + numéro Pennylane ; l'acompte se crée à la main dans Pennylane.

## Écrans (maquette texte)

### A. Paramètres › Pennylane › Rapprochement clients
```text
Rapprochement Pennylane            [Relire les clients Pennylane]
Filtre : (•) À valider  ( ) Sûrs  ( ) Sans correspondance  ( ) Rapprochés
--------------------------------------------------------------------
Client Staffing   | SIRET / TVA     | Proposition Pennylane | Motif       | Action
ACME SAS          | 812 345 678 ... | ACME (id 4411)        | SIRET égal  | [Valider]
Studio Nord       | — / FR12...     | Studio Nord SARL      | TVA égale   | [Valider]
Galerie B.        | — / —           | Galerie Bxl ?  (2)    | nom proche  | [Choisir ▾]
Maison X          | —               | aucune                |             | [Créer dans Pennylane…]
```
- Appariement : SIRET (14 chiffres, puis SIREN 9) → TVA intracom → nom normalisé.
- « Sûr » = un seul candidat par SIRET ou TVA ; tout le reste « à valider ». **Rien n'est enregistré sans clic humain**, y compris les cas sûrs (bouton « Valider les N sûrs » avec liste).
- « Créer dans Pennylane… » : panneau qui montre exactement les champs envoyés, puis confirmation. Désactivé tant que le droit d'écriture clients n'est pas accordé au jeton.
- 390 px : cartes, une par client, même actions.

### B. Devis signé — en-tête
```text
Pennylane : non transféré            [Transférer vers Pennylane]
  ⚠ Client non rapproché → [Rapprocher]   (bouton grisé tant que manquant)
Après : Pennylane D-2026-11-0042 · transféré le 24/11 par Gabin C · [Ouvrir dans Pennylane ↗]
        ⚠ Écart total HT : Staffing 6 563,05 € / Pennylane 6 563,04 € — laissé en brouillon
```

### C. Fenêtre « Options retenues »
```text
Options du devis 9524-R1                          
[ ] O1 Proposition 1 ............ 15 453,62 € HT
[x] O2 Proposition 2 ............ 17 295,97 € HT
[ ] O3 ... [ ] O4 ...
Total HT sans options     6 563,05 €
Total HT avec sélection  23 859,02 €   (remise appliquée)
TVA 20 % · TTC ...
Aucune e-mail ne sera envoyé. Le PDF Staffing (avec ces options) sera joint.
                                   [Annuler]  [Transférer]
```

## Fonctionnement serveur (fonction protégée, jeton jamais côté navigateur)
1. Vérifie droit `devis.pennylane`, statut signé, client rapproché, pas déjà transféré ; **réserve** le transfert (verrou en base, un seul à la fois, second refus définitif si un devis Pennylane existe).
2. Calcule le contenu via le calcul unique (`devis_lire_client` / `devis_calculer`) avec les options retenues traitées comme comprises.
3. Vérifie la numérotation devis Pennylane (`GET /numberings`) ; sans numérotation → arrêt avant création.
4. `POST /quotes` : `customer_id`, `date`, `deadline`, `pdf_invoice_subject` = libellé affaire, `external_reference` = « 9524-R1 », `invoice_line_sections` = zones, `invoice_lines` = objets (+ forfaits, transport, lignes libres) avec `label`, `description` = descriptif client, `quantity`, `unit`, `raw_currency_unit_price` = PU HT, `vat_rate` (FR_200 pour 20 % ; autre taux → table de correspondance, sinon arrêt), `section_rank` ; remise globale en `discount`.
5. Relit le devis créé (`GET /quotes/:id`) : total HT Pennylane = total HT Staffing au centime, sinon alerte + statut Staffing « écart », devis Pennylane laissé en brouillon (jamais de changement de statut côté Pennylane par Staffing).
6. Génère le PDF Staffing avec les options retenues, le dépose dans les exports existants et le joint (`POST /quotes/:id/appendices`).
7. Enregistre identifiant, numéro, date, auteur, options retenues, totaux, et chaque étape dans le journal.
- **Jamais** `send_by_email`, `update_status`, ni création de facture.
- Reprise : si le serveur s'interrompt après création, une nouvelle tentative recherche d'abord un devis Pennylane portant le même `external_reference` et reprend (pas de doublon).

## Points à arbitrer
1. Une remise en % ou en montant : envoi en `discount` global (à confirmer : type fixe ou pourcentage accepté par l'API).
2. Option retenue avec enfants : envoyée comme **une section par option** avec ses objets (proposé), ou une seule ligne au total de l'option ?
3. Unités Staffing (u, ens, m², forfait…) → liste des unités acceptées par Pennylane : correspondance à valider au premier essai.
4. Faut-il lier le devis Pennylane à un modèle (`quote_template_id`) ? Proposé : non.

## Scopes du jeton Pennylane
- `quotes:all` — créer, relire, joindre le PDF.
- `customers:readonly` — rapprochement.
- `customers:all` — **seulement** si la création de client depuis Staffing est voulue ; sinon les clients se créent dans Pennylane.
- Lecture de la numérotation : scope exact à vérifier au premier appel (documenté sans scope dédié) ; en cas de refus, contrôle remplacé par la vérification du numéro au retour.
- Pas de `customer_invoices`, pas de `products` (lignes libres sans produit).

## À configurer dans Pennylane (par Gabin)
- Ventes › Paramètres › **Numérotation des devis** (préfixe, compteur de départ) : sans elle, le devis est créé sans numéro.
- Mentions légales, conditions de paiement, IBAN, logo sur les documents de vente.
- **Comptes** : compte de produit (706 prestations / 701 selon le cas) et compte de TVA collectée 20 % par défaut pour les lignes sans produit ; nous ne passons pas `ledger_account_id`.
- Clients : vérifier SIRET / TVA renseignés pour un rapprochement automatique.
- Jeton développeur de la société (pas de cabinet) avec les scopes ci-dessus.

## Technique
- Fonctions serveur `createServerFn` + `requireSupabaseAuth`, droit vérifié en base, jeton lu dans le serveur uniquement ; client Pennylane avec délais, limitation de débit et pagination par curseur.
- Règles pures testées : appariement clients, construction de la charge utile, sélection des options, contrôle des totaux.
- Aucune donnée réelle modifiée pendant les essais : tests sur un devis d'essai, appel Pennylane réel seulement quand Gabin a mis le jeton et donne son accord.

## Migration proposée (non appliquée)
```sql
-- Droit dédié
INSERT INTO capabilities(key,label,description,category,sort_order)
VALUES ('devis.pennylane','Transférer les devis vers Pennylane','Rapprochement clients et transfert des devis signés','devis',905)
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_capabilities(role,capability,granted,scope) VALUES
 ('admin','devis.pennylane',true,'all'),('commercial','devis.pennylane',true,'all')
ON CONFLICT DO NOTHING;

-- Rapprochement client (pennylane_id existe déjà)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS pennylane_rapproche_le timestamptz,
  ADD COLUMN IF NOT EXISTS pennylane_rapproche_par uuid,
  ADD COLUMN IF NOT EXISTS pennylane_rapprochement_motif text;
CREATE UNIQUE INDEX IF NOT EXISTS clients_pennylane_id_uniq ON public.clients(pennylane_id) WHERE pennylane_id IS NOT NULL;

-- Transfert sur le devis
ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS pennylane_quote_id text,
  ADD COLUMN IF NOT EXISTS pennylane_numero text,
  ADD COLUMN IF NOT EXISTS pennylane_transfere_le timestamptz,
  ADD COLUMN IF NOT EXISTS pennylane_transfere_par uuid,
  ADD COLUMN IF NOT EXISTS pennylane_options_retenues uuid[],
  ADD COLUMN IF NOT EXISTS pennylane_total_ht numeric(12,2),
  ADD COLUMN IF NOT EXISTS pennylane_etat text CHECK (pennylane_etat IN ('en_cours','transfere','ecart','echec'));
CREATE UNIQUE INDEX IF NOT EXISTS devis_pennylane_quote_uniq ON public.devis(pennylane_quote_id) WHERE pennylane_quote_id IS NOT NULL;

-- Journal
CREATE TABLE public.devis_pennylane_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL REFERENCES public.devis(id),
  etape text NOT NULL,             -- reservation, creation, relecture, piece_jointe, ecart, echec, rapprochement
  detail jsonb NOT NULL DEFAULT '{}',  -- ids, totaux, code HTTP ; jamais le jeton ni de coût
  auteur uuid DEFAULT auth.uid(),
  cree_le timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.devis_pennylane_journal TO authenticated;
GRANT ALL ON public.devis_pennylane_journal TO service_role;
ALTER TABLE public.devis_pennylane_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY pennylane_journal_lire ON public.devis_pennylane_journal FOR SELECT TO authenticated
  USING (current_user_has_capability('devis.pennylane'));

-- RPC (SECURITY DEFINER, REVOKE PUBLIC/anon, GRANT authenticated ; vérifient devis.pennylane, posent app.devis_rpc)
--  devis_pennylane_reserver(_devis_id, _options uuid[]) : signé, client rapproché, options ∈ options du devis,
--      pas de pennylane_quote_id, verrou FOR UPDATE, état 'en_cours', journal ; refuse si déjà transféré.
--  devis_pennylane_enregistrer(_devis_id, _quote_id, _numero, _total_ht, _etat) : fin de transfert + journal.
--  devis_pennylane_echec(_devis_id, _detail) : libère la réservation si aucun devis Pennylane créé.
--  client_pennylane_rapprocher(_client_id, _pennylane_id, _motif) : écrit pennylane_id + traçabilité + journal ;
--      refuse un identifiant déjà attribué à un autre client.
```
