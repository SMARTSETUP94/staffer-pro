/**
 * Widget Leaderboard quiz — top 5 semaine + toggle All-time.
 * Médailles 🥇🥈🥉 sur le top 3.
 * Auto-hide si moins de 3 users ont répondu (sur la période sélectionnée).
 */
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Row {
  user_id: string;
  total_points: number;
  week_points: number;
  current_streak: number;
  full_name: string | null;
  avatar_url: string | null;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export function QuizLeaderboardWidget() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<"week" | "all">("week");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: stats } = await supabase
        .from("user_quiz_stats")
        .select("user_id, total_points, week_points, current_streak");
      if (cancelled || !stats || stats.length === 0) {
        setRows([]);
        return;
      }
      const validStats = stats.filter((s): s is typeof s & { user_id: string } => s.user_id !== null);
      const ids = validStats.map((s) => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", ids);
      const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const merged: Row[] = validStats.map((s) => ({
        user_id: s.user_id,
        total_points: s.total_points ?? 0,
        week_points: s.week_points ?? 0,
        current_streak: s.current_streak ?? 0,
        full_name: profMap.get(s.user_id)?.full_name ?? null,
        avatar_url: profMap.get(s.user_id)?.avatar_url ?? null,
      }));
      if (!cancelled) setRows(merged);
    })();
    return () => { cancelled = true; };
  }, []);

  if (rows === null) return null;

  const sorted = [...rows]
    .filter((r) => (tab === "week" ? r.week_points > 0 : r.total_points > 0))
    .sort((a, b) => (tab === "week" ? b.week_points - a.week_points : b.total_points - a.total_points))
    .slice(0, 5);

  const showEmpty = sorted.length === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          Leaderboard quiz
          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant={tab === "week" ? "default" : "ghost"}
              className="h-6 px-2 text-xs"
              onClick={() => setTab("week")}
            >
              Semaine
            </Button>
            <Button
              size="sm"
              variant={tab === "all" ? "default" : "ghost"}
              className="h-6 px-2 text-xs"
              onClick={() => setTab("all")}
            >
              All-time
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {showEmpty && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Pas encore de réponses {tab === "week" ? "cette semaine" : ""} — sois le premier !
          </p>
        )}
        {sorted.map((r, i) => {
          const initials = (r.full_name ?? "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
          const points = tab === "week" ? r.week_points : r.total_points;
          return (
            <div key={r.user_id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
              <span className="w-6 text-center text-sm">
                {i < 3 ? MEDALS[i] : <span className="text-muted-foreground">{i + 1}</span>}
              </span>
              <Avatar className="h-7 w-7">
                {r.avatar_url ? <AvatarImage src={r.avatar_url} /> : null}
                <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium flex-1 truncate">
                {r.full_name ?? "Utilisateur"}
              </span>
              {r.current_streak >= 3 && (
                <span className="text-xs text-orange-500" title={`Série ${r.current_streak}`}>
                  🔥{r.current_streak}
                </span>
              )}
              <span className={cn("text-sm font-semibold tabular-nums", i === 0 && "text-amber-600")}>
                {points} pts
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
