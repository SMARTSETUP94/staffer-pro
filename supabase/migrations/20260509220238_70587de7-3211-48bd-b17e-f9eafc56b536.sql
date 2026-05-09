-- 1. Élargir CHECK content_astuces.categorie aux 10 catégories
ALTER TABLE public.content_astuces DROP CONSTRAINT IF EXISTS content_astuces_categorie_check;
ALTER TABLE public.content_astuces ADD CONSTRAINT content_astuces_categorie_check
  CHECK (categorie IN ('atelier','process','securite','livraison','RH','montage','menuiserie','devis','logistique','peinture','tapisserie','culture'));

-- 2. Adapter UNIQUE quiz_responses : par quiz au lieu de par jour
DROP INDEX IF EXISTS public.quiz_responses_user_day_unique;
CREATE UNIQUE INDEX IF NOT EXISTS quiz_responses_user_quiz_unique
  ON public.quiz_responses(user_id, quiz_id);

-- 3. Refondre submit_quiz_answer : 1 réponse par quiz (à vie), streak basé sur "au moins 1 correct dans la journée"
CREATE OR REPLACE FUNCTION public.submit_quiz_answer(
  p_quiz_id uuid,
  p_answer_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_quiz public.content_quiz%ROWTYPE;
  v_today date := ((now() AT TIME ZONE 'Europe/Paris')::date);
  v_yesterday date := v_today - INTERVAL '1 day';
  v_existing public.quiz_responses%ROWTYPE;
  v_is_correct boolean;
  v_base_points int;
  v_multiplier numeric;
  v_streak_prev int;
  v_streak_new int;
  v_points int;
  v_already_correct_today boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT * INTO v_quiz FROM public.content_quiz WHERE id = p_quiz_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable ou inactif';
  END IF;

  -- Si déjà répondu à CE quiz → idempotent
  SELECT * INTO v_existing
    FROM public.quiz_responses
    WHERE user_id = v_user_id AND quiz_id = p_quiz_id
    LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already_answered', true,
      'is_correct', v_existing.is_correct,
      'answer_index', v_existing.answer_index,
      'points_earned', v_existing.points_earned,
      'current_streak', v_existing.streak_at_answer,
      'bonne_reponse_index', v_quiz.bonne_reponse_index,
      'explication', v_quiz.explication
    );
  END IF;

  v_is_correct := (p_answer_index = v_quiz.bonne_reponse_index);

  -- L'utilisateur a-t-il déjà répondu correctement à un quiz aujourd'hui ?
  -- (avant cette nouvelle réponse) → si oui, le streak du jour est déjà acquis
  SELECT EXISTS(
    SELECT 1 FROM public.quiz_responses
     WHERE user_id = v_user_id
       AND answered_day_paris = v_today
       AND is_correct = true
  ) INTO v_already_correct_today;

  IF v_already_correct_today THEN
    -- Reprendre le streak déjà calculé sur une réponse correcte d'aujourd'hui
    SELECT MAX(streak_at_answer) INTO v_streak_new
      FROM public.quiz_responses
      WHERE user_id = v_user_id
        AND answered_day_paris = v_today
        AND is_correct = true;
    IF v_streak_new IS NULL THEN v_streak_new := 0; END IF;
  ELSIF v_is_correct THEN
    -- Première bonne réponse du jour → calculer le streak basé sur la chaîne de jours avec ≥1 correct
    WITH RECURSIVE chain AS (
      SELECT v_yesterday AS d, 1 AS n
        WHERE EXISTS (
          SELECT 1 FROM public.quiz_responses
            WHERE user_id = v_user_id
              AND answered_day_paris = v_yesterday
              AND is_correct = true
        )
      UNION ALL
      SELECT (c.d - INTERVAL '1 day')::date, c.n + 1
        FROM chain c
        WHERE EXISTS (
          SELECT 1 FROM public.quiz_responses
            WHERE user_id = v_user_id
              AND answered_day_paris = (c.d - INTERVAL '1 day')::date
              AND is_correct = true
        )
    )
    SELECT COALESCE(MAX(n), 0) INTO v_streak_prev FROM chain;
    v_streak_new := v_streak_prev + 1;
  ELSE
    v_streak_new := 0;
  END IF;

  v_base_points := CASE v_quiz.difficulte
    WHEN 'facile' THEN 1
    WHEN 'moyen' THEN 2
    WHEN 'difficile' THEN 3
    ELSE 1
  END;

  v_multiplier := CASE
    WHEN NOT v_is_correct THEN 0
    WHEN v_streak_new >= 7 THEN 2.0
    WHEN v_streak_new >= 3 THEN 1.5
    ELSE 1.0
  END;

  v_points := FLOOR(v_base_points * v_multiplier)::int;

  INSERT INTO public.quiz_responses(user_id, quiz_id, answer_index, is_correct, points_earned, streak_at_answer)
    VALUES (v_user_id, p_quiz_id, p_answer_index, v_is_correct, v_points, v_streak_new);

  RETURN jsonb_build_object(
    'already_answered', false,
    'is_correct', v_is_correct,
    'answer_index', p_answer_index,
    'points_earned', v_points,
    'current_streak', v_streak_new,
    'multiplier', v_multiplier,
    'bonne_reponse_index', v_quiz.bonne_reponse_index,
    'explication', v_quiz.explication
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, integer) TO authenticated;