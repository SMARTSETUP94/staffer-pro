/**
 * v0.40.x — Widget "Astuce de la semaine" (rotation hebdo).
 * Source : table `dashboard_tips` (gérée via /admin/dashboard-tips).
 * Fallback : si pas de tips actives en DB → masqué (return null).
 */
import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { weekIndex } from "@/lib/dashboard-fun-helpers";
import { supabase } from "@/integrations/supabase/client";

interface Tip {
  id: string;
  texte: string;
  emoji: string;
  auteur: string | null;
}

export function TipDuJourWidget() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("dashboard_tips")
        .select("id, texte, emoji, auteur, ordre")
        .eq("active", true)
        .order("ordre", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setTip(null);
      } else {
        const idx = weekIndex(new Date()) % data.length;
        const row = data[idx]!;
        setTip({ id: row.id, texte: row.texte, emoji: row.emoji, auteur: row.auteur });
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!loaded || !tip) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Astuce de la semaine
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          <span className="mr-2 text-base">{tip.emoji}</span>
          {tip.texte}
        </p>
        {tip.auteur && (
          <p className="text-xs text-muted-foreground mt-1">— {tip.auteur}</p>
        )}
      </CardContent>
    </Card>
  );
}
