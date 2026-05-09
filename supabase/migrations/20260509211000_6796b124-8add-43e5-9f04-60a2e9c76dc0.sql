CREATE OR REPLACE FUNCTION public.validate_content_quiz_reponses()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF jsonb_typeof(NEW.reponses) <> 'array' THEN
    RAISE EXCEPTION 'reponses doit être un array JSON';
  END IF;
  IF jsonb_array_length(NEW.reponses) <> 4 THEN
    RAISE EXCEPTION 'reponses doit contenir exactement 4 éléments';
  END IF;
  RETURN NEW;
END
$$;