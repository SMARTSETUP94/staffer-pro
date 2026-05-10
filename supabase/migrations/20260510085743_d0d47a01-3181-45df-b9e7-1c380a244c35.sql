ALTER TABLE public.content_quiz DROP CONSTRAINT IF EXISTS content_quiz_categorie_check;
ALTER TABLE public.content_quiz ADD CONSTRAINT content_quiz_categorie_check
  CHECK (categorie = ANY (ARRAY[
    'securite'::text, 'menuiserie'::text, 'sceno'::text, 'event'::text, 'culture-G'::text,
    'decor-culture-g'::text, 'setup-histoire'::text, 'setup-orga'::text,
    'setup-clients'::text, 'setup-outils'::text, 'setup-machines'::text
  ]));