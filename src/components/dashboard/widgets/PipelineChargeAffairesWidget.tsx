/**
 * v0.26.0 — Widget "Pipeline par chargé d'affaires" (bar chart empilé par taille).
 */
import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, Cell } from "recharts";
import { useOpportunitesPipeline } from "@/hooks/use-opportunites-pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TAILLE_LABEL, TAILLE_ORDER, type OpportuniteTaille } from "@/lib/opportunites";

const TAILLE_COLOR: Record<OpportuniteTaille, string> = {
  tres_petit: "hsl(215 16% 70%)",
  petit: "hsl(199 89% 60%)",
  moyen: "hsl(231 65% 62%)",
  gros: "hsl(38 92% 55%)",
  tres_gros: "hsl(346 77% 60%)",
};

export function PipelineChargeAffairesWidget() {
  const { filtered, chargesById } = useOpportunitesPipeline();

  const chartData = useMemo(() => {
    const active = filtered.filter(
      (o) => o.statut_opportunite === "a_faire" || o.statut_opportunite === "envoye" || o.statut_opportunite === "gagne",
    );
    const byCa = new Map<string, { caId: string; caName: string; total: number } & Record<OpportuniteTaille, number>>();
    active.forEach((o) => {
      const caId = o.charge_affaires_id ?? "__none__";
      const caName = caId === "__none__" ? "Non assigné" : chargesById.get(caId)?.name ?? "Inconnu";
      let entry = byCa.get(caId);
      if (!entry) {
        entry = { caId, caName, total: 0, tres_petit: 0, petit: 0, moyen: 0, gros: 0, tres_gros: 0 };
        byCa.set(caId, entry);
      }
      const t = (o.taille ?? "tres_petit") as OpportuniteTaille;
      entry[t] += 1;
      entry.total += 1;
    });
    return Array.from(byCa.values()).filter((e) => e.total > 0).sort((a, b) => b.total - a.total);
  }, [filtered, chargesById]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Pipeline par chargé d'affaires
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Aucune opportunité active</p>
        ) : (
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="caName" tick={{ fontSize: 10 }} width={100} />
                <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(v: number, name: string) => [`${v}`, TAILLE_LABEL[name as OpportuniteTaille] ?? name]} />
                {TAILLE_ORDER.map((t) => (
                  <Bar key={t} dataKey={t} stackId="taille" fill={TAILLE_COLOR[t]}>
                    {chartData.map((_, i) => (<Cell key={i} fill={TAILLE_COLOR[t]} />))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
              {TAILLE_ORDER.map((t) => (
                <span key={t} className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: TAILLE_COLOR[t] }} />
                  {TAILLE_LABEL[t]}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
