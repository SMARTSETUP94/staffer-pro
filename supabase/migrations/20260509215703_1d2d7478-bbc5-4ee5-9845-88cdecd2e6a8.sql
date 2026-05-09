-- ============================================================
-- 1. Table quiz_responses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quiz_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_id uuid NOT NULL REFERENCES public.content_quiz(id) ON DELETE CASCADE,
  answer_index integer NOT NULL CHECK (answer_index >= 0 AND answer_index <= 3),
  is_correct boolean NOT NULL,
  points_earned integer NOT NULL DEFAULT 0,
  streak_at_answer integer NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  answered_day_paris date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Paris')::date)
);

-- 1 réponse / user / jour (Paris) — anti-double-soumission
CREATE UNIQUE INDEX IF NOT EXISTS quiz_responses_user_day_unique
  ON public.quiz_responses(user_id, answered_day_paris);

CREATE INDEX IF NOT EXISTS quiz_responses_user_idx ON public.quiz_responses(user_id);
CREATE INDEX IF NOT EXISTS quiz_responses_day_idx ON public.quiz_responses(answered_day_paris);

ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY quiz_responses_select_authenticated ON public.quiz_responses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY quiz_responses_insert_self ON public.quiz_responses
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY quiz_responses_update_admin ON public.quiz_responses
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY quiz_responses_delete_admin ON public.quiz_responses
  FOR DELETE TO authenticated USING (public.is_admin());

-- ============================================================
-- 2. RPC submit_quiz_answer (atomique)
-- ============================================================
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- Si déjà répondu aujourd'hui → renvoyer la réponse existante (idempotent)
  SELECT * INTO v_existing
    FROM public.quiz_responses
    WHERE user_id = v_user_id AND answered_day_paris = v_today
    LIMIT 1;

  SELECT * INTO v_quiz FROM public.content_quiz WHERE id = p_quiz_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable ou inactif';
  END IF;

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

  -- Calcul correctness
  v_is_correct := (p_answer_index = v_quiz.bonne_reponse_index);

  -- Streak : nb de jours consécutifs avec is_correct=true se terminant hier
  v_streak_prev := 0;
  IF v_is_correct THEN
    WITH RECURSIVE chain AS (
      SELECT answered_day_paris AS d, 1 AS n
        FROM public.quiz_responses
        WHERE user_id = v_user_id
          AND answered_day_paris = v_yesterday
          AND is_correct = true
      UNION ALL
      SELECT qr.answered_day_paris, c.n + 1
        FROM chain c
        JOIN public.quiz_responses qr
          ON qr.user_id = v_user_id
         AND qr.answered_day_paris = c.d - INTERVAL '1 day'
         AND qr.is_correct = true
    )
    SELECT COALESCE(MAX(n), 0) INTO v_streak_prev FROM chain;

    v_streak_new := v_streak_prev + 1;
  ELSE
    v_streak_new := 0;
  END IF;

  -- Points
  v_base_points := CASE v_quiz.difficulte
    WHEN 'facile' THEN 1
    WHEN 'moyen' THEN 2
    WHEN 'difficile' THEN 3
    ELSE 1
  END;

  -- Multiplicateur progressif
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

-- ============================================================
-- 3. Vue matérialisée user_quiz_stats
-- ============================================================
DROP MATERIALIZED VIEW IF EXISTS public.user_quiz_stats CASCADE;

CREATE MATERIALIZED VIEW public.user_quiz_stats AS
WITH base AS (
  SELECT
    qr.user_id,
    SUM(qr.points_earned) AS total_points,
    SUM(qr.points_earned) FILTER (
      WHERE qr.answered_day_paris >= date_trunc('week', (now() AT TIME ZONE 'Europe/Paris')::date)::date
    ) AS week_points,
    COUNT(*) AS total_answered,
    COUNT(*) FILTER (WHERE qr.is_correct) AS total_correct,
    MAX(qr.streak_at_answer) AS best_streak,
    MAX(qr.answered_at) AS last_answered_at
  FROM public.quiz_responses qr
  GROUP BY qr.user_id
),
current_streak AS (
  -- Streak actuel = streak_at_answer du jour le plus récent SI la réponse était correcte
  SELECT DISTINCT ON (user_id)
    user_id,
    CASE
      WHEN is_correct
       AND answered_day_paris >= ((now() AT TIME ZONE 'Europe/Paris')::date - INTERVAL '1 day')
      THEN streak_at_answer
      ELSE 0
    END AS cur_streak
  FROM public.quiz_responses
  ORDER BY user_id, answered_day_paris DESC
)
SELECT
  b.user_id,
  COALESCE(b.total_points, 0) AS total_points,
  COALESCE(b.week_points, 0) AS week_points,
  COALESCE(cs.cur_streak, 0) AS current_streak,
  COALESCE(b.best_streak, 0) AS best_streak,
  CASE WHEN b.total_answered > 0
    THEN ROUND((b.total_correct::numeric / b.total_answered::numeric) * 100, 1)
    ELSE 0 END AS accuracy_pct,
  b.total_answered,
  b.total_correct,
  b.last_answered_at,
  RANK() OVER (ORDER BY COALESCE(b.total_points, 0) DESC) AS rank_global,
  RANK() OVER (ORDER BY COALESCE(b.week_points, 0) DESC) AS rank_weekly
FROM base b
LEFT JOIN current_streak cs ON cs.user_id = b.user_id;

CREATE UNIQUE INDEX user_quiz_stats_user_idx ON public.user_quiz_stats(user_id);
CREATE INDEX user_quiz_stats_week_idx ON public.user_quiz_stats(week_points DESC);
CREATE INDEX user_quiz_stats_total_idx ON public.user_quiz_stats(total_points DESC);

GRANT SELECT ON public.user_quiz_stats TO authenticated;

-- Fonction de refresh (appelée par cron)
CREATE OR REPLACE FUNCTION public.refresh_user_quiz_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.user_quiz_stats;
EXCEPTION WHEN OTHERS THEN
  REFRESH MATERIALIZED VIEW public.user_quiz_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_user_quiz_stats() TO authenticated;

-- ============================================================
-- 4. Cron refresh quotidien 4h
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-user-quiz-stats') THEN
    PERFORM cron.unschedule('refresh-user-quiz-stats');
  END IF;
  PERFORM cron.schedule(
    'refresh-user-quiz-stats',
    '0 4 * * *',
    $job$ SELECT public.refresh_user_quiz_stats(); $job$
  );
END;
$$;
