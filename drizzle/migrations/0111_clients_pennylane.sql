ALTER TABLE public.clients
  ADD COLUMN type_client text NOT NULL DEFAULT 'entreprise'
    CHECK (type_client IN ('entreprise','particulier')),
  ADD COLUMN civilite_facturation text CHECK (civilite_facturation IN ('M','Mme')),
  ADD COLUMN prenom_facturation text,
  ADD COLUMN nom_facturation text,
  ADD COLUMN pays text NOT NULL DEFAULT 'FR' CHECK (pays ~ '^[A-Z]{2}$'),
  ADD COLUMN siren text CHECK (siren ~ '^\d{9}$'),
  ADD COLUMN emails_facturation text[] NOT NULL DEFAULT '{}',
  ADD COLUMN destinataire_facturation text,
  ADD COLUMN livraison_identique boolean NOT NULL DEFAULT true,
  ADD COLUMN adresse_livraison text,
  ADD COLUMN code_postal_livraison text,
  ADD COLUMN ville_livraison text,
  ADD COLUMN pays_livraison text DEFAULT NULL CHECK (pays_livraison ~ '^[A-Z]{2}$'),
  ADD COLUMN conditions_paiement text CHECK (conditions_paiement IN (
    'Payable dès réception','Paiement sous 30 jours','Paiement 30 jours fin de mois',
    'Paiement sous 45 jours','Paiement 45 jours fin de mois','Paiement sous 60 jours')),
  ADD COLUMN langue_facturation text NOT NULL DEFAULT 'fr_FR',
  ADD COLUMN reference_client text,
  ADD COLUMN numero_compte_client text CHECK (numero_compte_client ~ '^411[0-9A-Z]{1,12}$'),
  ADD COLUMN pennylane_id text;

CREATE UNIQUE INDEX clients_numero_compte_unique
  ON public.clients (numero_compte_client) WHERE numero_compte_client IS NOT NULL;
CREATE UNIQUE INDEX clients_pennylane_id_unique
  ON public.clients (pennylane_id) WHERE pennylane_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.siret_luhn_ok(_num text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE s int := 0; d int; i int; n int;
BEGIN
  IF _num !~ '^\d{9}$' AND _num !~ '^\d{14}$' THEN RETURN false; END IF;
  n := length(_num);
  IF left(_num, 9) = '356000000' AND n = 14 THEN
    FOR i IN 1..n LOOP s := s + substr(_num, i, 1)::int; END LOOP;
    RETURN s % 5 = 0;
  END IF;
  FOR i IN 1..n LOOP
    d := substr(_num, n - i + 1, 1)::int;
    IF i % 2 = 0 THEN d := d * 2; IF d > 9 THEN d := d - 9; END IF; END IF;
    s := s + d;
  END LOOP;
  RETURN s % 10 = 0;
END $$;
REVOKE ALL ON FUNCTION public.siret_luhn_ok(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.siret_luhn_ok(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clients_controle_pennylane() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE e text; chk_siret bool; chk_siren bool; chk_cp bool; chk_mails bool;
BEGIN
  IF TG_OP = 'INSERT' THEN
    chk_siret := true; chk_siren := true; chk_cp := true; chk_mails := true;
  ELSE
    chk_siret := NEW.siret IS DISTINCT FROM OLD.siret;
    chk_siren := NEW.siren IS DISTINCT FROM OLD.siren OR chk_siret;
    chk_cp    := NEW.code_postal IS DISTINCT FROM OLD.code_postal
                 OR NEW.pays IS DISTINCT FROM OLD.pays;
    chk_mails := NEW.emails_facturation IS DISTINCT FROM OLD.emails_facturation;
  END IF;

  IF chk_siret AND NEW.siret IS NOT NULL AND NOT public.siret_luhn_ok(NEW.siret) THEN
    RAISE EXCEPTION 'SIRET invalide (14 chiffres, clé de contrôle)';
  END IF;
  IF chk_siret AND NEW.siren IS NULL AND NEW.siret ~ '^\d{14}$' THEN
    NEW.siren := left(NEW.siret, 9);
  END IF;
  IF chk_siren AND NEW.siren IS NOT NULL THEN
    IF NEW.siren <> '356000000' AND NOT public.siret_luhn_ok(NEW.siren) THEN
      RAISE EXCEPTION 'SIREN invalide (9 chiffres, clé de contrôle)'; END IF;
    IF NEW.siret IS NOT NULL AND left(NEW.siret, 9) <> NEW.siren THEN
      RAISE EXCEPTION 'SIREN et SIRET ne correspondent pas'; END IF;
  END IF;
  IF chk_mails THEN
    FOREACH e IN ARRAY NEW.emails_facturation LOOP
      IF e !~* '^[^@\s,]+@[^@\s,]+\.[a-z]{2,}$' THEN
        RAISE EXCEPTION 'E-mail de facturation invalide : %', e; END IF;
    END LOOP;
  END IF;
  IF chk_cp AND NEW.pays = 'FR' AND NEW.code_postal IS NOT NULL
     AND NEW.code_postal !~ '^\d{5}$' THEN
    RAISE EXCEPTION 'Code postal français : 5 chiffres'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.clients_controle_pennylane() FROM PUBLIC, anon;

CREATE TRIGGER trg_clients_controle_pennylane
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_controle_pennylane();