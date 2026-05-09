/**
 * Mini-stats personnelles quiz (sur card profil dashboard).
 * Affiche : points semaine, streak, accuracy.
 * Auto-hide si jamais répondu.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

interface Stats {
  week_points: number;
  current_streak: number;
  accuracy_pct: number;
  total_answered: number;
}

export function MesQuizStatsWidget() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_quiz_stats")
        .select("week_points, current_streak, accuracy_pct, total_answered")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && data) setStats(data as Stats);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!stats || stats.total_answered === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        🎯 Quiz : réponds à ta première question pour démarrer ta série !
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span title="Points cette semaine">📊 Quiz <strong className="text-foreground">{stats.week_points}</strong> pts</span>
      <span title="Série de bonnes réponses">🔥 Série <strong className="text-foreground">{stats.current_streak}</strong></span>
      <span title="Taux de bonnes réponses">🎯 <strong className="text-foreground">{stats.accuracy_pct}%</strong></span>
    </div>
  );
}
