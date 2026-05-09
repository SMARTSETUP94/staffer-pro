/**
 * Widget "Quiz du jour" — rotation journalière déterministe (date-of-year).
 * Source : table `content_quiz` WHERE active=true.
 * Interaction : clic sur une réponse → feedback bonne/mauvaise + explication.
 * Auto-hide si table vide.
 */
import { useEffect, useState } from "react";
import { Brain, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dateIndex } from "@/lib/dashboard-fun-helpers";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Quiz {
  id: string;
  question: string;
  reponses: string[];
  bonne_reponse_index: number;
  explication: string | null;
  categorie: string;
  difficulte: string;
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
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("content_quiz")
        .select("id, question, reponses, bonne_reponse_index, explication, categorie, difficulte")
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setQuiz(null);
      } else {
        const idx = dateIndex(new Date()) % data.length;
        const row = data[idx] as { id: string; question: string; reponses: unknown; bonne_reponse_index: number; explication: string | null; categorie: string; difficulte: string };
        const reponses = Array.isArray(row.reponses) ? (row.reponses as string[]) : [];
        if (reponses.length === 4) {
          setQuiz({ ...row, reponses });
        }
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!loaded || !quiz) return null;

  const isAnswered = picked !== null;
  const isCorrect = picked === quiz.bonne_reponse_index;

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
            const isPicked = picked === i;
            const isGood = i === quiz.bonne_reponse_index;
            const showCorrect = isAnswered && isGood;
            const showWrong = isAnswered && isPicked && !isGood;
            return (
              <Button
                key={i}
                variant="outline"
                size="sm"
                disabled={isAnswered}
                onClick={() => setPicked(i)}
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
          <div className={cn(
            "rounded-md p-2 text-xs",
            isCorrect ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
          )}>
            <p className="font-medium mb-0.5">
              {isCorrect ? "Bonne réponse !" : `Raté — la bonne réponse était : ${String.fromCharCode(65 + quiz.bonne_reponse_index)}`}
            </p>
            {quiz.explication && <p className="text-muted-foreground">{quiz.explication}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
