-- Fonction RPC : import atomique d'un devis (affaire + devis + postes)
-- Réservé aux chefs/admin via RLS implicite (la fonction réutilise les RLS via SECURITY INVOKER).

CREATE OR REPLACE FUNCTION public.import_devis_atomique(
  _affaire_id uuid,                 -- NULL si nouvelle affaire
  _new_affaire jsonb,               -- {numero, nom, client, lieu} si nouvelle affaire
  _date_montage date,
  _date_demontage date,
  _devis jsonb,                     -- {numero, libelle, montant_ht, fichier_source}
  _postes jsonb                     -- [{metier_id, heures_prevues, montant_ht, libelle_source}, ...]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _final_affaire_id uuid;
  _devis_id uuid;
  _poste jsonb;
  _inserted_postes int := 0;
BEGIN
  -- Garde-fou : seuls les chefs/admins peuvent importer
  IF NOT public.is_chef_or_admin() THEN
    RAISE EXCEPTION 'Action réservée aux chefs de chantier et administrateurs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 1. Affaire : création ou mise à jour
  IF _affaire_id IS NULL THEN
    INSERT INTO public.affaires (numero, nom, client, lieu, statut, date_montage, date_demontage)
    VALUES (
      NULLIF(trim(_new_affaire->>'numero'), ''),
      NULLIF(trim(_new_affaire->>'nom'), ''),
      NULLIF(trim(_new_affaire->>'client'), ''),
      NULLIF(trim(_new_affaire->>'lieu'), ''),
      'en_cours',
      _date_montage,
      _date_demontage
    )
    RETURNING id INTO _final_affaire_id;
  ELSE
    UPDATE public.affaires
       SET date_montage = _date_montage,
           date_demontage = _date_demontage,
           updated_at = now()
     WHERE id = _affaire_id;
    _final_affaire_id := _affaire_id;
  END IF;

  -- 2. Devis
  INSERT INTO public.devis (affaire_id, numero, libelle, montant_ht, statut, fichier_source)
  VALUES (
    _final_affaire_id,
    NULLIF(trim(_devis->>'numero'), ''),
    NULLIF(trim(_devis->>'libelle'), ''),
    NULLIF(_devis->>'montant_ht', '')::numeric,
    'signe',
    NULLIF(trim(_devis->>'fichier_source'), '')
  )
  RETURNING id INTO _devis_id;

  -- 3. Postes
  IF jsonb_typeof(_postes) = 'array' THEN
    FOR _poste IN SELECT * FROM jsonb_array_elements(_postes) LOOP
      INSERT INTO public.devis_postes (devis_id, metier_id, heures_prevues, montant_ht, libelle_source)
      VALUES (
        _devis_id,
        (_poste->>'metier_id')::int,
        COALESCE((_poste->>'heures_prevues')::numeric, 0),
        NULLIF(_poste->>'montant_ht', '')::numeric,
        NULLIF(trim(_poste->>'libelle_source'), '')
      );
      _inserted_postes := _inserted_postes + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'affaire_id', _final_affaire_id,
    'devis_id', _devis_id,
    'postes_count', _inserted_postes
  );
END;
$$;

COMMENT ON FUNCTION public.import_devis_atomique IS
  'Import atomique d''un devis : crée/maj affaire, crée devis, insère postes en une transaction. Retourne {affaire_id, devis_id, postes_count}.';