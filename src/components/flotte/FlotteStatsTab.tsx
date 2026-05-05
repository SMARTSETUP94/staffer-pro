/**
 * v0.41.0b — Sprint 3b.4 : Statistiques flotte (KPIs + charts).
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Truck, Euro, MapPinned } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useVehicules } from "@/hooks/use-vehicules";
import { useTrajetsRange } from "@/hooks/use-trajets-range";
import { useSousTraitants } from "@/hooks/use-sous-traitants";
import { computeFlotteStats, CATEGORIE_LABEL, STATUT_LABEL } from "@/lib/trajets-stats";

const TODAY = new Date().toISOString().slice(0, 10);
const ONE_YEAR_AGO = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
})();

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function StatCard({ icon: Icon, label, value, sub }: {
  icon: typeof Truck;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold mt-1">{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
          </div>
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export function FlotteStatsTab() {
  const [dateFrom, setDateFrom] = useState<string>(ONE_YEAR_AGO);
  const [dateTo, setDateTo] = useState<string>(TODAY);
  const { trajets, isLoading } = useTrajetsRange(dateFrom, dateTo);
  const { vehicules } = useVehicules();
  const { data: sousTraitants } = useSousTraitants();

  const tarifsParPresta = useMemo(() => {
    const m = new Map<string, number>();
    for (const st of sousTraitants) {
      if (st.tarif_km_eur != null) m.set(st.nom.toLowerCase(), Number(st.tarif_km_eur));
    }
    return m;
  }, [sousTraitants]);

  const stats = useMemo(
    () => computeFlotteStats(trajets, vehicules, tarifsParPresta),
    [trajets, vehicules, tarifsParPresta],
  );

  const tauxSoustraitance = stats.totalTrajets > 0
    ? Math.round((stats.totalSousTraites / stats.totalTrajets) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Du</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Au</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={Truck}
              label="Trajets totaux"
              value={stats.totalTrajets.toString()}
              sub={`${stats.totalKm.toLocaleString("fr-FR")} km`}
            />
            <StatCard
              icon={MapPinned}
              label="Sous-traités"
              value={stats.totalSousTraites.toString()}
              sub={`${tauxSoustraitance}% du total`}
            />
            <StatCard
              icon={TrendingUp}
              label="Confirmés"
              value={stats.totalConfirmes.toString()}
              sub={`${stats.totalSousTraites - stats.totalConfirmes} en cours`}
            />
            <StatCard
              icon={Euro}
              label="€ engagés (estim.)"
              value={`${stats.totalEurEngages.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`}
              sub="Confirmés × tarif/km"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trajets par catégorie</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.parCategorie.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">Aucune donnée</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={stats.parCategorie.map((c) => ({
                      name: CATEGORIE_LABEL[c.categorie],
                      Trajets: c.count,
                      Km: c.km,
                    }))}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Trajets" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Répartition par statut</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.parStatut.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">Aucune donnée</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={stats.parStatut.map((s) => ({
                          name: STATUT_LABEL[s.statut],
                          value: s.count,
                        }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {stats.parStatut.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top transporteurs</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.topTransporteurs.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    Aucun trajet sous-traité sur la période
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stats.topTransporteurs.map((t, i) => (
                      <div key={t.prestataire} className="flex items-center gap-3">
                        <div className="w-6 text-xs text-muted-foreground font-mono">#{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{t.prestataire}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.count} trajet{t.count > 1 ? "s" : ""} · {t.km.toLocaleString("fr-FR")} km
                          </div>
                        </div>
                        <Badge variant="secondary">{t.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top véhicules (km)</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.parVehicule.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">Aucune donnée</div>
                ) : (
                  <div className="space-y-2">
                    {stats.parVehicule.map((v, i) => (
                      <div key={v.vehiculeId} className="flex items-center gap-3">
                        <div className="w-6 text-xs text-muted-foreground font-mono">#{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{v.nom}</div>
                          <div className="text-xs text-muted-foreground">
                            {v.count} trajet{v.count > 1 ? "s" : ""}
                          </div>
                        </div>
                        <Badge variant="outline" className="font-mono">
                          {v.km.toLocaleString("fr-FR")} km
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
