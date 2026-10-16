CREATE POLICY "affaires_chantier_update"
ON public.affaires
FOR UPDATE
TO authenticated
USING (
  phase = 'signe'::affaire_phase
  AND current_user_has_capability('section.affaires'::text)
)
WITH CHECK (
  phase = 'signe'::affaire_phase
  AND current_user_has_capability('section.affaires'::text)
);