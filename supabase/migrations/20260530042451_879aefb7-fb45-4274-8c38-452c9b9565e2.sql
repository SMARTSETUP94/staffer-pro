ALTER TABLE public.heures_saisies
  ADD COLUMN IF NOT EXISTS etape_chantier text
  CHECK (
    etape_chantier IS NULL
    OR etape_chantier IN (
      'Montage','Démontage','Rotation','Permanence',
      'Finition','Chargement','Déchargement','Traçage'
    )
  );

COMMENT ON COLUMN public.heures_saisies.etape_chantier IS
  'Étape de chantier (4XXX) : Montage / Démontage / Rotation / Permanence / Finition / Chargement / Déchargement / Traçage. Mutuellement exclusif avec fabrication_objet_id / fabrication_etape_type (réservés aux 5XXX).';