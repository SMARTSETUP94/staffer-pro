/**
 * v0.26.0 — Widget "Pipeline par typologie".
 */
import { TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Cell } from "recharts";
import { useOpportunitesPipeline } from "@/hooks/use-opportunites-pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type AffaireTypologie,
  AFFAIRE_TYPOLOGIES,
  AFFAIRE_TYPOLOGIE_LABELS,
  AFFAIRE_TYPOLOGIE_COLORS,
  getAffaireTypologie,
} from "@/lib/affaire-typologie";

export function PipelineTypologieWidget() {
  const { opps } = useOpportunitesPipeline();

  const counts: Record<AffaireTypologie, number> = {
    non_operationnel: 0, montage_demontage: 0, fabrication: 0, stockage: 0, prototype: 0,
  };
  opps.forEach((o) => {
    const t = getAffaireTypologie(o.numero);
    if (t) counts[t] += 1;
  });
  const data = AFFAIRE_TYPOLOGIES.map((t) => ({
    key: t, label: AFFAIRE_TYPOLOGIE_LABELS[t], count: counts[t], fill: AFFAIRE_TYPOLOGIE_COLORS[t].fg,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Pipeline par typologie
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <RTooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((d) => (<Cell key={d.key} fill={d.fill} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
