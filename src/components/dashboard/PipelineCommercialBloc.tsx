import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  TrendingUp,
  Send,
  Trophy,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";
import { useChargesAffaires } from "@/hooks/use-charges-affaires";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  STATUT_LABEL,
  TAILLE_LABEL,
  TAILLE_ORDER,
  type OpportuniteStatut,
  type OpportuniteTaille,
} from "@/lib/opportunites";
import {
  type AffaireTypologie,
  AFFAIRE_TYPOLOGIES,
  AFFAIRE_TYPOLOGIE_LABELS,
  AFFAIRE_TYPOLOGIE_COLORS,
  getAffaireTypologie,
} from "@/lib/affaire-typologie";
import {
  actionUrgency,
  URGENCY_CLASS,
  fmtActionDate,
} from "@/lib/opportunite-action-urgency";

interface OppRow {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  charge_affaires_id: string | null;
  taille: OpportuniteTaille | null;
  statut_opportunite: OpportuniteStatut | null;
  date_opportunite: string | null;
  signed_at: string | null;
  code_opportunite: string | null;
  updated_at: string;
}

const TAILLE_COLOR: Record<OpportuniteTaille, string> = {
  tres_petit: "hsl(215 16% 70%)",
  petit: "hsl(199 89% 60%)",
  moyen: "hsl(231 65% 62%)",
  gros: "hsl(38 92% 55%)",
  tres_gros: "hsl(346 77% 60%)",
};

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Math.floor((Date.now() - t) / 86_400_000);
}

function fmtShort(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/**
 * v0.17 — Bloc Pipeline commercial pour le dashboard.
 * 3 KPIs + bloc tension + bar chart par CA empilé par taille + activité récente.
 * Toggle "Moi / Tous" — défaut user connecté (admin = Tous).
 */
export function PipelineCommercialBloc() {
  const { user } = useAuth();
  const isAdmin = useCapability("dashboard.commerce.view");
  const { data: charges } = useChargesAffaires();
  const [scope, setScope] = useState<"mine" | "all">("all");
  const [opps, setOpps] = useState<OppRow[]>([]);
  const [nextActionByAffaire, setNextActionByAffaire] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  // Init scope par défaut une fois user chargé
  const [scopeInit, setScopeInit] = useState(false);
  useEffect(() => {
    if (scopeInit) return;
    if (isAdmin) {
      setScope("all");
      setScopeInit(true);
    } else if (user?.id) {
      setScope("mine");
      setScopeInit(true);
    }
  }, [isAdmin, user?.id, scopeInit]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Toutes les opportunités (phase=opportunite) + signées récentes (pour activité)
      const { data, error } = await supabase
        .from("affaires")
        .select(
          "id, numero, nom, client, charge_affaires_id, taille, statut_opportunite, date_opportunite, signed_at, code_opportunite, updated_at, phase",
        )
        .or("phase.eq.opportunite,code_opportunite.not.is.null")
        .is("archived_at", null);
      if (cancelled) return;
      if (error) {
        setOpps([]);
      } else {
        const rows = (data ?? []) as unknown as OppRow[];
        setOpps(rows);
        // Bloc 10.4 — fetch next pending action per opp pour badge urgence
        const oppIds = rows.map((r) => r.id);
        if (oppIds.length > 0) {
          const { data: actions } = await supabase
            .from("opportunite_actions")
            .select("affaire_id, prochaine_action_due_le")
            .in("affaire_id", oppIds)
            .not("prochaine_action_due_le", "is", null)
            .order("prochaine_action_due_le", { ascending: true });
          if (!cancelled && actions) {
            const map = new Map<string, string>();
            (actions as Array<{ affaire_id: string; prochaine_action_due_le: string }>).forEach(
              (a) => {
                if (!map.has(a.affaire_id)) map.set(a.affaire_id, a.prochaine_action_due_le);
              },
            );
            setNextActionByAffaire(map);
          }
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chargesById = useMemo(() => {
    const m = new Map<string, { name: string }>();
    charges.forEach((c) => m.set(c.id, { name: c.full_name ?? c.email }));
    return m;
  }, [charges]);

  const filtered = useMemo(() => {
    if (scope === "mine" && user?.id) {
      return opps.filter((o) => o.charge_affaires_id === user.id);
    }
    return opps;
  }, [opps, scope, user?.id]);

  // Opportunités actives (phase=opportunite, statut a_faire / envoye / gagne)
  const aFaire = useMemo(
    () => filtered.filter((o) => o.statut_opportunite === "a_faire"),
    [filtered],
  );
  const envoyees = useMemo(
    () => filtered.filter((o) => o.statut_opportunite === "envoye"),
    [filtered],
  );
  // Tension
  const aFaireTension = useMemo(
    () => aFaire.filter((o) => daysSince(o.date_opportunite) >= 1),
    [aFaire],
  );
  const envoyeesRelance = useMemo(
    () => envoyees.filter((o) => daysSince(o.date_opportunite) >= 3),
    [envoyees],
  );

  // Conversions ce mois (signed_at ce mois) vs mois précédent
  const conversionsStats = useMemo(() => {
    const now = new Date();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    let mois = 0;
    let prev = 0;
    filtered.forEach((o) => {
      if (!o.signed_at) return;
      const d = new Date(o.signed_at);
      if (d >= startThisMonth) mois += 1;
      else if (d >= startPrevMonth && d <= endPrevMonth) prev += 1;
    });
    return { mois, prev, delta: mois - prev };
  }, [filtered]);

  // Bloc tension priorisé : combiner les 3 seuils
  const tensionItems = useMemo(() => {
    const items: Array<{
      opp: OppRow;
      severity: "rouge" | "orange" | "jaune";
      ageDays: number;
      label: string;
    }> = [];
    aFaire.forEach((o) => {
      const age = daysSince(o.date_opportunite);
      if (age >= 2) items.push({ opp: o, severity: "rouge", ageDays: age, label: "À traiter +48h" });
      else if (age >= 1)
        items.push({ opp: o, severity: "orange", ageDays: age, label: "À traiter +24h" });
    });
    envoyees.forEach((o) => {
      const age = daysSince(o.date_opportunite);
      if (age >= 3) items.push({ opp: o, severity: "jaune", ageDays: age, label: "Envoyée +3j" });
    });
    items.sort((a, b) => b.ageDays - a.ageDays);
    return items.slice(0, 8);
  }, [aFaire, envoyees]);

  // Bar chart par CA empilé par TAILLE (uniquement opps actives)
  const chartData = useMemo(() => {
    const active = filtered.filter(
      (o) => o.statut_opportunite === "a_faire" || o.statut_opportunite === "envoye" || o.statut_opportunite === "gagne",
    );
    const byCa = new Map<
      string,
      { caId: string; caName: string; total: number } & Record<OpportuniteTaille, number>
    >();
    active.forEach((o) => {
      const caId = o.charge_affaires_id ?? "__none__";
      const caName =
        caId === "__none__" ? "Non assigné" : chargesById.get(caId)?.name ?? "Inconnu";
      let entry = byCa.get(caId);
      if (!entry) {
        entry = {
          caId,
          caName,
          total: 0,
          tres_petit: 0,
          petit: 0,
          moyen: 0,
          gros: 0,
          tres_gros: 0,
        };
        byCa.set(caId, entry);
      }
      const t = (o.taille ?? "tres_petit") as OpportuniteTaille;
      entry[t] += 1;
      entry.total += 1;
    });
    return Array.from(byCa.values())
      .filter((e) => e.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [filtered, chargesById]);

  // Activité récente : 5 dernières conversions (signed_at desc) + 5 dernières perdues
  const recentConversions = useMemo(() => {
    return filtered
      .filter((o) => !!o.signed_at && !!o.code_opportunite)
      .sort((a, b) => (b.signed_at ?? "").localeCompare(a.signed_at ?? ""))
      .slice(0, 5);
  }, [filtered]);

  const recentLost = useMemo(() => {
    return filtered
      .filter((o) => o.statut_opportunite === "perdu")
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5);
  }, [filtered]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const deltaSign = conversionsStats.delta > 0 ? "+" : "";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Pipeline commercial
          </h2>
          <p className="text-xs text-muted-foreground">
            {scope === "mine" ? "Vos opportunités" : "Toutes les opportunités"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={scope} onValueChange={(v) => setScope(v as "mine" | "all")}>
            <TabsList className="h-8">
              <TabsTrigger value="mine" className="text-xs h-7">Moi</TabsTrigger>
              <TabsTrigger value="all" className="text-xs h-7">Tous</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button asChild variant="ghost" size="sm">
            <Link to="/opportunites">
              Kanban <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>

      {/* 3 tuiles KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          icon={AlertTriangle}
          label="À traiter"
          value={aFaire.length}
          sub={
            aFaireTension.length > 0
              ? `${aFaireTension.length} en tension`
              : "Aucune en tension"
          }
          tone={aFaireTension.length > 0 ? "warning" : "default"}
        />
        <KpiTile
          icon={Send}
          label="Envoyées"
          value={envoyees.length}
          sub={
            envoyeesRelance.length > 0
              ? `${envoyeesRelance.length} à relancer`
              : "Aucune à relancer"
          }
          tone={envoyeesRelance.length > 0 ? "warning" : "default"}
        />
        <KpiTile
          icon={Trophy}
          label="Gagnées ce mois"
          value={conversionsStats.mois}
          sub={
            conversionsStats.prev === 0 && conversionsStats.mois === 0
              ? "Aucune signature"
              : `${deltaSign}${conversionsStats.delta} vs mois précédent`
          }
          tone={conversionsStats.delta >= 0 ? "success" : "warning"}
          deltaIcon={
            conversionsStats.delta > 0
              ? ArrowUpRight
              : conversionsStats.delta < 0
                ? ArrowDownRight
                : undefined
          }
        />
      </div>

      {/* Tension + Bar chart */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              À traiter en priorité
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tensionItems.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Aucune opportunité en tension 🎉
              </p>
            ) : (
              <ul className="space-y-1.5">
                {tensionItems.map(({ opp, severity, ageDays, label }) => {
                  const dot =
                    severity === "rouge"
                      ? "🔴"
                      : severity === "orange"
                        ? "🟠"
                        : "🟡";
                  const caName = opp.charge_affaires_id
                    ? chargesById.get(opp.charge_affaires_id)?.name ?? "—"
                    : "Non assigné";
                  const dueIso = nextActionByAffaire.get(opp.id) ?? null;
                  const urgency = actionUrgency(dueIso);
                  const overdue = urgency === "overdue";
                  return (
                    <li
                      key={opp.id}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 hover:bg-muted/30 ${
                        overdue
                          ? "border-rose-300 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20"
                          : "border-border/50"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-sm" aria-hidden>
                          {dot}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">
                            <span className="font-mono text-primary">{opp.numero}</span>{" "}
                            <span className="text-muted-foreground">·</span>{" "}
                            {opp.client ?? opp.nom}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {label} · {caName}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {urgency && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] tabular-nums ${URGENCY_CLASS[urgency]}`}
                            title="Prochaine action commerciale"
                          >
                            {fmtActionDate(dueIso)}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] tabular-nums">
                          {ageDays}j
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Pipeline par chargé d'affaires
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Aucune opportunité active
              </p>
            ) : (
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="caName"
                      tick={{ fontSize: 10 }}
                      width={100}
                    />
                    <RTooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                      formatter={(v: number, name: string) => [
                        `${v}`,
                        TAILLE_LABEL[name as OpportuniteTaille] ?? name,
                      ]}
                    />
                    {TAILLE_ORDER.map((t) => (
                      <Bar key={t} dataKey={t} stackId="taille" fill={TAILLE_COLOR[t]}>
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={TAILLE_COLOR[t]} />
                        ))}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                  {TAILLE_ORDER.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-sm"
                        style={{ background: TAILLE_COLOR[t] }}
                      />
                      {TAILLE_LABEL[t]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activité récente */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Conversions récentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentConversions.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Aucune conversion récente
              </p>
            ) : (
              <ul className="divide-y">
                {recentConversions.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <Link
                        to="/affaires/$affaireId"
                        params={{ affaireId: o.id }}
                        className="truncate text-xs font-medium hover:text-primary block"
                      >
                        <span className="font-mono text-muted-foreground line-through mr-1">
                          {o.code_opportunite}
                        </span>
                        →{" "}
                        <span className="font-mono text-primary">{o.numero}</span>{" "}
                        <span className="text-muted-foreground">·</span> {o.client ?? o.nom}
                      </Link>
                      <p className="text-[10px] text-muted-foreground">
                        {o.charge_affaires_id
                          ? chargesById.get(o.charge_affaires_id)?.name ?? "—"
                          : "Non assigné"}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {fmtShort(o.signed_at)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-600" />
              Opportunités perdues
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentLost.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Aucune opportunité perdue
              </p>
            ) : (
              <ul className="divide-y">
                {recentLost.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        <span className="font-mono text-muted-foreground">{o.numero}</span>{" "}
                        <span className="text-muted-foreground">·</span>{" "}
                        {o.client ?? o.nom}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {o.charge_affaires_id
                          ? chargesById.get(o.charge_affaires_id)?.name ?? "—"
                          : "Non assigné"}
                        {" · "}
                        {STATUT_LABEL[o.statut_opportunite ?? "perdu"]}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {fmtShort(o.updated_at)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* v0.24.0 — Segmentation par typologie chantier */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Pipeline par typologie
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const counts: Record<AffaireTypologie, number> = {
              non_operationnel: 0,
              montage_demontage: 0,
              fabrication: 0,
              stockage: 0,
              prototype: 0,
            };
            opps.forEach((o) => {
              const t = getAffaireTypologie(o.numero);
              if (t) counts[t] += 1;
            });
            const data = AFFAIRE_TYPOLOGIES.map((t) => ({
              key: t,
              label: AFFAIRE_TYPOLOGIE_LABELS[t],
              count: counts[t],
              fill: AFFAIRE_TYPOLOGIE_COLORS[t].fg,
            }));
            return (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <RTooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.map((d) => (
                      <Cell key={d.key} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
        </CardContent>
      </Card>
    </section>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  deltaIcon: DeltaIcon,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: number;
  sub: string;
  tone?: "default" | "warning" | "success";
  deltaIcon?: typeof ArrowUpRight;
}) {
  const toneCls =
    tone === "warning"
      ? "border-warning/40 bg-warning/5"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-900/10"
        : "border-border";
  const subCls =
    tone === "warning" ? "text-warning" : tone === "success" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground";
  return (
    <div className={`rounded-2xl border bg-card p-4 ${toneCls}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      <p className={`mt-0.5 text-[11px] ${subCls} flex items-center gap-1`}>
        {DeltaIcon && <DeltaIcon className="h-3 w-3" aria-hidden />}
        {sub}
      </p>
    </div>
  );
}
