/**
 * v0.40.x — Widget "Astuce du jour" (rotation hebdomadaire).
 */
import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DASHBOARD_TIPS } from "@/lib/dashboard-tips";
import { weekIndex } from "@/lib/dashboard-fun-helpers";

export function TipDuJourWidget() {
  const idx = weekIndex(new Date()) % DASHBOARD_TIPS.length;
  const tip = DASHBOARD_TIPS[idx];
  if (!tip) return null;

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
          {tip.text}
        </p>
      </CardContent>
    </Card>
  );
}
