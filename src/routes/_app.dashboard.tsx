import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Building2,
  CalendarOff,
  ClipboardCheck,
  TrendingUp,
  Calendar,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/use-notifications";
import { ABSENCE_ICON, ABSENCE_LABEL } from "@/lib/absence-helpers";
import { ChargeEquipeBloc } from "@/components/dashboard/ChargeEquipeBloc";
import { MeteoChantiersBloc } from "@/components/dashboard/MeteoChantiersBloc";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

interface AffaireEvenement {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  date: string;
  lieu: string | null;
  type: "montage" | "demontage";
}

interface AffaireDepassement {
  affaire_id: string;
  numero: string;
  nom: string;
  total_prevues: number;
  total_assignees: number;
  total_validees: number;
  pct: number;
  pct_valide: number;
}

interface AbsenceItem {
  id: string;
  employe_id: string;
  type: string;
  date_debut: string;
  date_fin: string;
  valide: boolean;
  employe?: { prenom: string; nom: string };
}

interface HeuresSoumise {
  id: string;
  date: string;
  employe?: { prenom: string; nom: string };
  affaire?: { numero: string; nom: string };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  s.setDate(s.getDate() + 6);
  s.setHours(23, 59, 59, 999);
  return s;
}

function DashboardPage() {
  const { unreadCount } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [chantiersSemaineProchaine, setChantiersSemaineProchaine] = useState<
    { id: string; numero: string; nom: string }[]
  >([]);
  const [heuresSemaine, setHeuresSemaine] = useState(0);
  const [evenementsProches, setEvenementsProches] = useState<AffaireEvenement[]>([]);
  const [depassements, setDepassements] = useState<AffaireDepassement[]>([]);
  const [heuresAValider, setHeuresAValider] = useState<HeuresSoumise[]>([]);
  const [absencesSemaine, setAbsencesSemaine] = useState<AbsenceItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const weekStart = startOfWeek(today).toISOString().slice(0, 10);
      const weekEnd = endOfWeek(today).toISOString().slice(0, 10);
      const nextWeekStartDate = startOfWeek(today);
      nextWeekStartDate.setDate(nextWeekStartDate.getDate() + 7);
      const nextWeekEndDate = endOfWeek(nextWeekStartDate);
      const nextWeekStart = nextWeekStartDate.toISOString().slice(0, 10);
      const nextWeekEnd = nextWeekEndDate.toISOString().slice(0, 10);
      const j7 = new Date(today);
      j7.setDate(j7.getDate() + 7);
      const j7Str = j7.toISOString().slice(0, 10);

      const [
        chantiersNextRes,
        heuresWeekRes,
        montagesRes,
        margesRes,
        soumisesRes,
        absRes,
      ] = await Promise.all([
        supabase
          .from("assignations")
          .select("affaire_id, affaires:affaire_id(id, numero, nom)")
          .gte("date", nextWeekStart)
          .lte("date", nextWeekEnd),
        supabase.from("assignations").select("heures").gte("date", weekStart).lte("date", weekEnd),
        supabase
          .from("affaires")
          .select("id, numero, nom, client, date_montage, date_demontage, lieu")
          .or(`and(date_montage.gte.${todayStr},date_montage.lte.${j7Str}),and(date_demontage.gte.${todayStr},date_demontage.lte.${j7Str})`)
          .limit(20),
        supabase
          .from("v_affaire_consommation")
          .select(
            "affaire_id, numero, nom, total_heures_prevues, total_heures_assignees, total_heures_reelles_validees",
          ),
        supabase
          .from("heures_saisies")
          .select("id, date, employes:employe_id(prenom, nom), affaires:affaire_id(numero, nom)")
          .eq("statut", "soumis")
          .order("date", { ascending: false })
          .limit(8),
        supabase
          .from("absences")
          .select("id, employe_id, type, date_debut, date_fin, valide, employes:employe_id(prenom, nom)")
          .or(`and(date_debut.lte.${weekEnd},date_fin.gte.${weekStart})`)
          .order("date_debut", { ascending: true })
          .limit(20),
      ]);

      if (cancelled) return;

      const chantiersMap = new Map<string, { id: string; numero: string; nom: string }>();
      for (const r of (chantiersNextRes.data ?? []) as any[]) {
        const aff = r.affaires;
        if (aff && !chantiersMap.has(aff.id)) {
          chantiersMap.set(aff.id, { id: aff.id, numero: aff.numero, nom: aff.nom });
        }
      }
      setChantiersSemaineProchaine(
        Array.from(chantiersMap.values()).sort((a, b) => a.numero.localeCompare(b.numero)),
      );
      setHeuresSemaine(
        (heuresWeekRes.data ?? []).reduce((acc, r) => acc + Number(r.heures ?? 0), 0),
      );

      const events: AffaireEvenement[] = [];
      for (const a of montagesRes.data ?? []) {
        if (a.date_montage && a.date_montage >= todayStr && a.date_montage <= j7Str) {
          events.push({
            id: a.id,
            numero: a.numero,
            nom: a.nom,
            client: a.client,
            lieu: a.lieu,
            date: a.date_montage,
            type: "montage",
          });
        }
        if (a.date_demontage && a.date_demontage >= todayStr && a.date_demontage <= j7Str) {
          events.push({
            id: a.id,
            numero: a.numero,
            nom: a.nom,
            client: a.client,
            lieu: a.lieu,
            date: a.date_demontage,
            type: "demontage",
          });
        }
      }
      events.sort((a, b) => a.date.localeCompare(b.date));
      setEvenementsProches(events);

      const dep = (margesRes.data ?? [])
        .filter((r) => Number(r.total_heures_prevues ?? 0) > 0)
        .map((r) => {
          const prev = Number(r.total_heures_prevues ?? 0);
          const ass = Number(r.total_heures_assignees ?? 0);
          const val = Number(r.total_heures_reelles_validees ?? 0);
          return {
            affaire_id: r.affaire_id as string,
            numero: r.numero as string,
            nom: r.nom as string,
            total_prevues: prev,
            total_assignees: ass,
            total_validees: val,
            pct: prev > 0 ? Math.round((ass / prev) * 100) : 0,
            pct_valide: prev > 0 ? Math.round((val / prev) * 100) : 0,
          };
        })
        .filter((r) => Math.max(r.pct, r.pct_valide) >= 80)
        .sort((a, b) => Math.max(b.pct, b.pct_valide) - Math.max(a.pct, a.pct_valide))
        .slice(0, 5);
      setDepassements(dep);

      setHeuresAValider(
        (soumisesRes.data ?? []).map((h: any) => ({
          id: h.id,
          date: h.date,
          employe: h.employes,
          affaire: h.affaires,
        })),
      );

      setAbsencesSemaine(
        (absRes.data ?? []).map((a: any) => ({
          id: a.id,
          employe_id: a.employe_id,
          type: a.type,
          date_debut: a.date_debut,
          date_fin: a.date_fin,
          valide: a.valide,
          employe: a.employes,
        })),
      );

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const today = new Date();
  const weekStartStr = startOfWeek(today).toISOString().slice(0, 10);
  const weekEndStr = endOfWeek(today).toISOString().slice(0, 10);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        number="00"
        eyebrow="Pilotage / Tableau de bord"
        title="Bonjour"
        description="Vue d'ensemble de l'activité chantier"
      />

      {unreadCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <p className="text-sm">
              <span className="font-semibold">{unreadCount} alerte{unreadCount > 1 ? "s" : ""} non lue{unreadCount > 1 ? "s" : ""}</span>
              <span className="ml-2 text-muted-foreground">dans la cloche notifications</span>
            </p>
          </div>
        </div>
      )}

      {/* KPIs scalaires */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <KpiCard
                  icon={Building2}
                  label="Chantiers staffés (S+1)"
                  value={chantiersSemaineProchaine.length}
                  to="/planning"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-xs">
              {chantiersSemaineProchaine.length === 0 ? (
                <p className="text-xs">Aucun chantier staffé la semaine prochaine</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-semibold">Chantiers concernés</p>
                  <ul className="space-y-0.5 text-xs">
                    {chantiersSemaineProchaine.slice(0, 12).map((c) => (
                      <li key={c.id} className="truncate">
                        <span className="font-medium">{c.numero}</span> — {c.nom}
                      </li>
                    ))}
                    {chantiersSemaineProchaine.length > 12 && (
                      <li className="italic opacity-70">
                        + {chantiersSemaineProchaine.length - 12} autre
                        {chantiersSemaineProchaine.length - 12 > 1 ? "s" : ""}…
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <KpiCard icon={Calendar} label="Heures cette semaine" value={`${heuresSemaine}h`} to="/planning" />
        <KpiCard icon={ClipboardCheck} label="Heures à valider" value={heuresAValider.length} to="/validation-heures" emphasize={heuresAValider.length > 0} />
      </div>

      <MeteoChantiersBloc />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChargeEquipeBloc weekStart={weekStartStr} weekEnd={weekEndStr} />
        {/* Bloc montages & démontages J+7 */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Prochains montages & démontages (J+7)
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/planning">
                Planning <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {evenementsProches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun événement prévu dans les 7 jours</p>
            ) : (
              <ul className="divide-y">
                {evenementsProches.map((e) => {
                  const isMontage = e.type === "montage";
                  const Icon = isMontage ? ArrowUpCircle : ArrowDownCircle;
                  return (
                    <li key={`${e.id}-${e.type}`} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${isMontage ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <Link
                            to="/affaires/$affaireId"
                            params={{ affaireId: e.id }}
                            className="text-sm font-medium hover:text-primary truncate block"
                          >
                            {e.numero} — {e.nom}
                          </Link>
                          <p className="text-xs text-muted-foreground truncate">
                            {isMontage ? "Montage" : "Démontage"}
                            {e.client ? ` · ${e.client}` : ""}
                            {e.lieu ? ` · ${e.lieu}` : ""}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {fmtDate(e.date)}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Bloc dépassements */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Top affaires en tension budget
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/affaires">
                Voir tout <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {depassements.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucune affaire en tension (≥80% consommé)</p>
            ) : (
              <ul className="space-y-3">
                {depassements.map((d) => {
                  const tone = d.pct >= 100 ? "destructive" : d.pct >= 90 ? "default" : "secondary";
                  const barColor =
                    d.pct >= 100 ? "bg-destructive" : d.pct >= 90 ? "bg-primary" : "bg-warning";
                  return (
                    <li key={d.affaire_id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          to="/affaires/$affaireId"
                          params={{ affaireId: d.affaire_id }}
                          className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary"
                          title={`${d.numero} — ${d.nom}`}
                        >
                          <span className="font-mono text-xs text-primary">{d.numero}</span>
                          <span className="mx-1 text-muted-foreground">·</span>
                          <span>{d.nom}</span>
                        </Link>
                        <Badge variant={tone} className="shrink-0 text-xs tabular-nums">
                          {d.pct}%
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full ${barColor}`}
                            style={{ width: `${Math.min(100, d.pct)}%` }}
                            aria-hidden
                          />
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {d.total_assignees}/{d.total_prevues}h
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Bloc heures à valider */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              Heures à valider
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/validation-heures">
                Valider <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {heuresAValider.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Tout est validé 🎉</p>
            ) : (
              <ul className="divide-y">
                {heuresAValider.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {h.employe?.prenom} {h.employe?.nom}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono text-primary">{h.affaire?.numero ?? "—"}</span>
                        {h.affaire?.nom ? <span> · {h.affaire.nom}</span> : null}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[11px] tabular-nums">
                      {fmtDate(h.date)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Bloc absences semaine */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-primary" />
              Absences cette semaine
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/absences">
                Gérer <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {absencesSemaine.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucune absence cette semaine</p>
            ) : (
              <ul className="divide-y">
                {absencesSemaine.map((a) => (
                  <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span aria-hidden>{ABSENCE_ICON[a.type as keyof typeof ABSENCE_ICON] ?? "📌"}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {a.employe?.prenom} {a.employe?.nom}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {ABSENCE_LABEL[a.type as keyof typeof ABSENCE_LABEL] ?? a.type} ·{" "}
                          {a.date_debut === a.date_fin
                            ? fmtDate(a.date_debut)
                            : `${fmtDate(a.date_debut)} → ${fmtDate(a.date_fin)}`}
                        </p>
                      </div>
                    </div>
                    {!a.valide && (
                      <Badge variant="outline" className="text-[11px] shrink-0">À valider</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  to,
  emphasize,
}: {
  icon: typeof Building2;
  label: string;
  value: string | number;
  to: string;
  emphasize?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`group block rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${emphasize ? "border-primary/40 bg-primary/5" : "border-border"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
          {label}
        </p>
        <Icon className={`h-4 w-4 shrink-0 ${emphasize ? "text-primary" : "text-muted-foreground"}`} aria-hidden />
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
    </Link>
  );
}
