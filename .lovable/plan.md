# Fiches clients prêtes pour Pennylane

Aucun client importé, aucune donnée existante modifiée. Droits inchangés (les règles actuelles de la fiche client s'appliquent aux nouveaux champs). Rien publié.

## État vérifié
- 95 clients, 9 avec SIRET (tous à 14 chiffres), aucun code postal invalide.
- Champs déjà présents réutilisés : nom (= Dénomination), siret, adresse, code_postal, ville, telephone, email, tva_intracom.

## 1. Migration (ajouts seulement, sur la table clients)

```sql
ALTER TABLE public.clients
  ADD COLUMN type_client text NOT NULL DEFAULT 'entreprise'
    CHECK (type_client IN ('entreprise','particulier')),
  ADD COLUMN civilite_facturation text CHECK (civilite_facturation IN ('M','Mme')),
  ADD COLUMN prenom_facturation text,
  ADD COLUMN nom_facturation text,
  ADD COLUMN pays text NOT NULL DEFAULT 'FR' CHECK (pays ~ '^[A-Z]{2}$'),
  ADD COLUMN siren text GENERATED ALWAYS AS (
    CASE WHEN siret ~ '^\d{14}$' THEN left(siret, 9) END) STORED,
  ADD COLUMN emails_facturation text[] NOT NULL DEFAULT '{}',
  ADD COLUMN destinataire_facturation text,
  ADD COLUMN livraison_identique boolean NOT NULL DEFAULT true,
  ADD COLUMN adresse_livraison text,
  ADD COLUMN code_postal_livraison text,
  ADD COLUMN ville_livraison text,
  ADD COLUMN pays_livraison text CHECK (pays_livraison ~ '^[A-Z]{2}$'),
  ADD COLUMN conditions_paiement text CHECK (conditions_paiement IN (
    'Payable dès réception','Paiement sous 30 jours','30 jours fin de mois',
    'Paiement sous 45 jours','45 jours fin de mois','Paiement sous 60 jours')),
  ADD COLUMN langue_facturation text NOT NULL DEFAULT 'fr_FR',
  ADD COLUMN reference_client text,
  ADD COLUMN numero_compte_client text CHECK (numero_compte_client ~ '^411[0-9A-Z]{1,12}$'),
  ADD COLUMN pennylane_id text;

-- Unicité seulement si renseigné
CREATE UNIQUE INDEX clients_numero_compte_unique
  ON public.clients (numero_compte_client) WHERE numero_compte_client IS NOT NULL;
CREATE UNIQUE INDEX clients_pennylane_id_unique
  ON public.clients (pennylane_id) WHERE pennylane_id IS NOT NULL;

-- Contrôles à l'écriture (trigger, n'agit que sur les champs modifiés,
-- NOT VALID implicite : les fiches existantes ne sont pas réécrites)
CREATE OR REPLACE FUNCTION public.clients_controle_pennylane() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE e text;
BEGIN
  IF NEW.siret IS DISTINCT FROM OLD.siret AND NEW.siret IS NOT NULL
     AND NOT public.siret_luhn_ok(NEW.siret) THEN
    RAISE EXCEPTION 'SIRET invalide (14 chiffres, clé de contrôle)';
  END IF;
  FOREACH e IN ARRAY NEW.emails_facturation LOOP
    IF e !~* '^[^@\s,]+@[^@\s,]+\.[a-z]{2,}$' THEN
      RAISE EXCEPTION 'E-mail de facturation invalide : %', e; END IF;
  END LOOP;
  IF NEW.pays = 'FR' AND NEW.code_postal IS DISTINCT FROM OLD.code_postal
     AND NEW.code_postal IS NOT NULL AND NEW.code_postal !~ '^\d{5}$' THEN
    RAISE EXCEPTION 'Code postal français : 5 chiffres'; END IF;
  RETURN NEW;
END $$;
-- (+ fonction pure siret_luhn_ok, IMMUTABLE ; trigger BEFORE INSERT OR UPDATE)
```

La TVA n'est pas bloquée en base : un avertissement s'affiche si elle ne correspond pas au SIREN.

## 2. Fiche client — section « Facturation (Pennylane) »
- Type entreprise / particulier (particulier : civilité, prénom, nom).
- SIREN affiché en lecture seule (dérivé du SIRET).
- Bouton « Calculer la TVA depuis le SIREN » (clé FR = (12 + 3 × (SIREN mod 97)) mod 97), jamais automatique.
- E-mails de facturation (plusieurs, puces), destinataire, pays (liste FR/MC/IT/GB/BE/CH/…), langue, conditions de paiement (vide = conditions de l'entreprise), référence client, compte 411…, identifiant Pennylane (lecture seule, vide).
- Adresse de livraison avec case « Identique à l'adresse de facturation » (cochée par défaut).
- Indicateur « Fiche complète pour Pennylane » ou liste des champs manquants : dénomination, SIREN (entreprise FR), adresse + CP + ville, pays, ≥ 1 e-mail de facturation, conditions de paiement.

## 3. Liste des clients
- Filtre « Incomplet pour Pennylane » + pastille par ligne, calculé par la même règle.

## 4. Plus tard (non construit) — export CSV Pennylane
Bouton dans la liste : CSV UTF-8, séparateur « ; », colonnes dans l'ordre Pennylane (Rôle=Client, Identifiant=pennylane_id, Dénomination, Siren, Numéro de compte, Adresse, CP, Ville, Pays, e-mails joints par « , », Téléphone, Référence, Destinataire, Prénom, Nom, Sexe, livraison (copie de la facturation si identique), TVA, Langue, Conditions). Option « fiches complètes seulement ».

## Détails techniques
- Règles pures partagées `src/lib/clients/pennylane.ts` (Luhn, TVA, complétude, champs manquants) + tests Vitest : SIRET valide/invalide, TVA calculée sur un SIREN connu, complétude entreprise vs particulier, CP hors FR non contrôlé.
- Édition via les écrans existants (`_app.clients.$clientId.tsx`, `NouveauClientDialog`) sous la règle de mise à jour actuelle ; lecteurs MCP inchangés.
- Champs mis dans AGENTS.md (règle unique de complétude partagée UI/liste/export).
