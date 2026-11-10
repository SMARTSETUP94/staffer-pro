CREATE OR REPLACE FUNCTION public.clients_controle_pennylane() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE e text; chk_siret bool; chk_siren bool; chk_cp bool; chk_mails bool;
  rejets text[] := '{}'; ok text[] := '{}';
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

  -- Jamais bloquant : valeur invalide => champ vidé, valeur brute gardée dans les notes
  IF chk_siret AND NEW.siret IS NOT NULL AND NOT public.siret_luhn_ok(NEW.siret) THEN
    rejets := rejets || ('SIRET : ' || NEW.siret); NEW.siret := NULL;
  END IF;
  IF chk_siret AND NEW.siren IS NULL AND NEW.siret ~ '^\d{14}$' THEN
    NEW.siren := left(NEW.siret, 9);
  END IF;
  IF chk_siren AND NEW.siren IS NOT NULL THEN
    IF NEW.siren !~ '^\d{9}$'
       OR (NEW.siren <> '356000000' AND NOT public.siret_luhn_ok(NEW.siren))
       OR (NEW.siret IS NOT NULL AND left(NEW.siret, 9) <> NEW.siren) THEN
      rejets := rejets || ('SIREN : ' || NEW.siren); NEW.siren := NULL;
    END IF;
  END IF;
  IF chk_mails THEN
    FOREACH e IN ARRAY coalesce(NEW.emails_facturation, '{}') LOOP
      IF e ~* '^[^@\s,]+@[^@\s,]+\.[a-z]{2,}$' THEN ok := ok || e;
      ELSE rejets := rejets || ('E-mail de facturation : ' || e); END IF;
    END LOOP;
    NEW.emails_facturation := ok;
  END IF;
  IF chk_cp AND NEW.pays = 'FR' AND NEW.code_postal IS NOT NULL
     AND NEW.code_postal !~ '^\d{5}$' THEN
    rejets := rejets || ('Code postal : ' || NEW.code_postal); NEW.code_postal := NULL;
  END IF;

  IF array_length(rejets, 1) > 0 THEN
    NEW.notes := concat_ws(E'\n', NEW.notes,
      '[Valeur non conforme écartée ' || to_char(now(), 'DD/MM/YYYY') || '] ' || array_to_string(rejets, ' ; '));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.clients_controle_pennylane() FROM PUBLIC, anon;