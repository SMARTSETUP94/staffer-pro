/**
 * Widget "Quiz du jour" interactif avec scoring.
 * - Click sur une réponse → RPC submit_quiz_answer atomique.
 * - Anti-double-soumission : si déjà répondu aujourd'hui, affiche le résultat précédent.
 * - Feedback : vert ✓ / rouge ✗ + bonne réponse en surbrillance + explication.
 * - Encart "+X points · streak Y" en bas.
 * - Auto-hide si table vide.
 */
import { useEffect, useState } from "react";
import { Brain, Check, X, Flame, Sparkles } from "lucide-react";
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

export function QuizDuJourWidget() {
  const { user } = useAuth();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("content_quiz")
        .select("id, question, reponses, bonne_reponse_index, explication, categorie, difficulte")
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (!data || data.length === 0) {
        setLoaded(true);
        return;
      }
      const idx = dateIndex(new Date()) % data.length;
      const row = data[idx] as { id: string; question: string; reponses: unknown; bonne_reponse_index: number; explication: string | null; categorie: string; difficulte: string };
      const reponses = Array.isArray(row.reponses) ? (row.reponses as string[]) : [];
      if (reponses.length !== 4) {
        setLoaded(true);
        return;
      }
      const q: Quiz = { ...row, reponses };
      setQuiz(q);

      // Vérifier si déjà répondu aujourd'hui
      if (user?.id) {
        const todayParis = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
        const { data: existing } = await supabase
          .from("quiz_responses")
          .select("answer_index, is_correct, points_earned, streak_at_answer")
          .eq("user_id", user.id)
          .eq("answered_day_paris", todayParis)
          .maybeSingle();
        if (!cancelled && existing) {
          setResult({
            is_correct: existing.is_correct,
            answer_index: existing.answer_index,
            points_earned: existing.points_earned,
            current_streak: existing.streak_at_answer,
            bonne_reponse_index: q.bonne_reponse_index,
            explication: q.explication,
            already_answered: true,
          });
        }
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handlePick = async (i: number) => {
    if (!quiz || result || submitting) return;
    setSubmitting(true);
    const { data, error } = await supabase.rpc("submit_quiz_answer", {
      p_quiz_id: quiz.id,
      p_answer_index: i,
    });
    setSubmitting(false);
    if (error || !data) return;
    setResult(data as unknown as AnswerResult);
  };

  if (!loaded || !quiz) return null;

  const isAnswered = result !== null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <Brain className="h-4 w-4 text-violet-500" />
          Quiz du jour
          <Badge variant="outline" className="text-xs font-normal">
            {CAT_LABEL[quiz.categorie] ?? quiz.categorie}
          </Badge>
          <Badge variant="outline" className={cn("text-xs font-normal", DIFF_COLOR[quiz.difficulte])}>
            {quiz.difficulte}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm font-medium">{quiz.question}</p>
        <div className="grid gap-1.5">
          {quiz.reponses.map((r, i) => {
            const isPicked = isAnswered && result.answer_index === i;
            const isGood = i === quiz.bonne_reponse_index;
            const showCorrect = isAnswered && isGood;
            const showWrong = isAnswered && isPicked && !isGood;
            return (
              <Button
                key={i}
                variant="outline"
                size="sm"
                disabled={isAnswered || submitting}
                onClick={() => handlePick(i)}
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
        {isAnswered && (
          <>
            <div className={cn(
              "rounded-md p-2 text-xs",
              result.is_correct ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
            )}>
              <p className="font-medium mb-0.5">
                {result.is_correct ? "Bonne réponse !" : `Raté — la bonne réponse était : ${String.fromCharCode(65 + quiz.bonne_reponse_index)}`}
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
              {result.already_answered && (
                <span className="text-muted-foreground italic">(déjà joué)</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
