/**
 * Widget "Quiz du jour" — 5 questions par jour, déterministes (mêmes pour tous).
 * - Sélection : dateIndex % nb_quiz, 5 IDs consécutifs avec wrap-around (anti-collision garantie).
 * - UNIQUE(user_id, quiz_id) : 1 réponse par quiz à vie.
 * - Section collapsible, 5 cards empilées.
 * - Si tous les quiz du DB sont déjà répondus → message épuisement.
 */
import { useEffect, useMemo, useState } from "react";
import { Brain, Check, X, Flame, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dateIndex } from "@/lib/dashboard-fun-helpers";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface Quiz {
  id: string;
  question: string;
  reponses: string[];
  bonne_reponse_index: number;
  explication: string | null;
  categorie: string;
  difficulte: string;
}

interface AnswerResult {
  is_correct: boolean;
  answer_index: number;
  points_earned: number;
  current_streak: number;
  bonne_reponse_index: number;
  explication: string | null;
  multiplier?: number;
  already_answered: boolean;
}

const CAT_LABEL: Record<string, string> = {
  sceno: "Scéno",
  menuiserie: "Menuiserie",
  securite: "Sécurité",
  event: "Event",
  "culture-G": "Culture G",
};

const DIFF_COLOR: Record<string, string> = {
  facile: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  moyen: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  difficile: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

const DAILY_COUNT = 5;

/** Sélection déterministe : dateIndex % nb, 5 IDs consécutifs avec wrap-around. */
export function pickDailyQuizIds(allIds: string[], today: Date, count = DAILY_COUNT): string[] {
  if (allIds.length === 0) return [];
  const sorted = [...allIds].sort();
  const n = sorted.length;
  const k = Math.min(count, n);
  const offset = ((dateIndex(today) % n) + n) % n;
  const out: string[] = [];
  for (let i = 0; i < k; i++) {
    out.push(sorted[(offset + i) % n]);
  }
  return out;
}

export function QuizDuJourWidget() {
  const { user } = useAuth();
  const [allQuiz, setAllQuiz] = useState<Quiz[]>([]);
  const [responses, setResponses] = useState<Record<string, AnswerResult>>({});
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("content_quiz")
        .select("id, question, reponses, bonne_reponse_index, explication, categorie, difficulte")
        .eq("active", true);
      if (cancelled) return;
      const list: Quiz[] = (data ?? [])
        .map((row) => {
          const reponses = Array.isArray(row.reponses) ? (row.reponses as unknown as string[]) : [];
          return reponses.length === 4 ? ({ ...row, reponses } as Quiz) : null;
        })
        .filter((q): q is Quiz => q !== null);
      setAllQuiz(list);

      if (user?.id && list.length > 0) {
        const { data: existing } = await supabase
          .from("quiz_responses")
          .select("quiz_id, answer_index, is_correct, points_earned, streak_at_answer")
          .eq("user_id", user.id);
        if (!cancelled && existing) {
          const map: Record<string, AnswerResult> = {};
          for (const r of existing) {
            const q = list.find((x) => x.id === r.quiz_id);
            if (!q) continue;
            map[r.quiz_id] = {
              is_correct: r.is_correct,
              answer_index: r.answer_index,
              points_earned: r.points_earned,
              current_streak: r.streak_at_answer,
              bonne_reponse_index: q.bonne_reponse_index,
              explication: q.explication,
              already_answered: true,
            };
          }
          setResponses(map);
        }
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const dailyQuiz = useMemo(() => {
    const ids = pickDailyQuizIds(allQuiz.map((q) => q.id), new Date());
    return ids.map((id) => allQuiz.find((q) => q.id === id)!).filter(Boolean);
  }, [allQuiz]);

  const allAnswered = allQuiz.length > 0 && Object.keys(responses).length >= allQuiz.length;

  const handlePick = async (quizId: string, i: number) => {
    if (responses[quizId] || submittingId) return;
    setSubmittingId(quizId);
    const { data, error } = await supabase.rpc("submit_quiz_answer", {
      p_quiz_id: quizId,
      p_answer_index: i,
    });
    setSubmittingId(null);
    if (error || !data) return;
    setResponses((prev) => ({ ...prev, [quizId]: data as unknown as AnswerResult }));
  };

  if (!loaded) return null;
  if (allQuiz.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-500" />
          Quiz du jour
          <Badge variant="outline" className="text-xs font-normal ml-1">
            {DAILY_COUNT} questions
          </Badge>
          <span className="ml-auto">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {allAnswered ? (
            <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground text-center">
              Tu as fait le tour des quiz, reviens quand on en ajoutera de nouveaux 🧠
            </div>
          ) : (
            dailyQuiz.map((quiz, idx) => {
              const result = responses[quiz.id] ?? null;
              const isAnswered = result !== null;
              const isSubmitting = submittingId === quiz.id;
              return (
                <div key={quiz.id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-mono text-muted-foreground">Q{idx + 1}/{dailyQuiz.length}</span>
                    <Badge variant="outline" className="text-xs font-normal">
                      {CAT_LABEL[quiz.categorie] ?? quiz.categorie}
                    </Badge>
                    <Badge variant="outline" className={cn("text-xs font-normal", DIFF_COLOR[quiz.difficulte])}>
                      {quiz.difficulte}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{quiz.question}</p>
                  <div className="grid gap-1.5">
                    {quiz.reponses.map((r, i) => {
                      const isPicked = isAnswered && result!.answer_index === i;
                      const isGood = i === quiz.bonne_reponse_index;
                      const showCorrect = isAnswered && isGood;
                      const showWrong = isAnswered && isPicked && !isGood;
                      return (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          disabled={isAnswered || isSubmitting}
                          onClick={() => handlePick(quiz.id, i)}
                          className={cn(
                            "justify-start text-left h-auto py-1.5 text-xs whitespace-normal",
                            showCorrect && "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400",
                            showWrong && "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400",
                          )}
                        >
                          <span className="mr-2 font-mono text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
                          <span className="flex-1">{r}</span>
                          {showCorrect && <Check className="h-3.5 w-3.5 ml-1" />}
                          {showWrong && <X className="h-3.5 w-3.5 ml-1" />}
                        </Button>
                      );
                    })}
                  </div>
                  {isAnswered && result && (
                    <>
                      <div className={cn(
                        "rounded-md p-2 text-xs",
                        result.is_correct
                          ? "bg-green-500/10 text-green-700 dark:text-green-400"
                          : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                      )}>
                        <p className="font-medium mb-0.5">
                          {result.is_correct
                            ? "Bonne réponse !"
                            : `Raté — la bonne réponse était : ${String.fromCharCode(65 + quiz.bonne_reponse_index)}`}
                        </p>
                        {quiz.explication && <p className="text-muted-foreground">{quiz.explication}</p>}
                      </div>
                      <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          <strong>+{result.points_earned}</strong> {result.points_earned > 1 ? "points" : "point"}
                          {result.multiplier && result.multiplier > 1 && (
                            <span className="text-muted-foreground">(×{result.multiplier})</span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <Flame className={cn("h-3.5 w-3.5", result.current_streak >= 3 ? "text-orange-500" : "text-muted-foreground")} />
                          Série : <strong>{result.current_streak}</strong>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      )}
    </Card>
  );
}
