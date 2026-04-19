import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Building2,
  CalendarOff,
  ClipboardCheck,
  TrendingUp,
  Users,
  Calendar,
  AlertTriangle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/use-notifications";
import { ABSENCE_ICON, ABSENCE_LABEL } from "@/lib/absence-helpers";
import { ChargeEquipeBloc } from "@/components/dashboard/ChargeEquipeBloc";
import { MeteoChantiersBloc } from "@/components/dashboard/MeteoChantiersBloc";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

interface AffaireMontage {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  date_montage: string | null;
  lieu: string | null;
}

interface AffaireDepassement {
  affaire_id: string;
  numero: string;
  nom: string;
  total_prevues: number;
  total_assignees: number;
  pct: number;
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
  const [affairesActives, setAffairesActives] = useState(0);
  const [employesActifs, setEmployesActifs] = useState(0);
  const [heuresSemaine, setHeuresSemaine] = useState(0);
  const [montagesProches, setMontagesProches] = useState<AffaireMontage[]>([]);
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
      const j7 = new Date(today);
      j7.setDate(j7.getDate() + 7);
      const j7Str = j7.toISOString().slice(0, 10);

      const [
        affairesRes,
        employesRes,
        heuresWeekRes,
        montagesRes,
        margesRes,
        soumisesRes,
        absRes,
      ] = await Promise.all([
        supabase.from("affaires").select("id", { count: "exact", head: true }).eq("statut", "en_cours"),
        supabase.from("employes").select("id", { count: "exact", head: true }).eq("actif", true).eq("non_staffing", false),
        supabase.from("assignations").select("heures").gte("date", weekStart).lte("date", weekEnd),
        supabase
          .from("affaires")
          .select("id, numero, nom, client, date_montage, lieu")
          .gte("date_montage", todayStr)
          .lte("date_montage", j7Str)
          .order("date_montage", { ascending: true })
          .limit(10),
        supabase.from("v_affaire_consommation").select("affaire_id, numero, nom, total_heures_prevues, total_heures_assignees"),
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

      setAffairesActives(affairesRes.count ?? 0);
      setEmployesActifs(employesRes.count ?? 0);
      setHeuresSemaine(
        (heuresWeekRes.data ?? []).reduce((acc, r) => acc + Number(r.heures ?? 0), 0),
      );
      setMontagesProches(montagesRes.data ?? []);

      const dep = (margesRes.data ?? [])
        .filter((r) => Number(r.total_heures_prevues ?? 0) > 0)
        .map((r) => {
          const prev = Number(r.total_heures_prevues ?? 0);
          const ass = Number(r.total_heures_assignees ?? 0);
          return {
            affaire_id: r.affaire_id as string,
            numero: r.numero as string,
            nom: r.nom as string,
            total_prevues: prev,
            total_assignees: ass,
            pct: prev > 0 ? Math.round((ass / prev) * 100) : 0,
          };
        })
        .filter((r) => r.pct >= 80)
        .sort((a, b) => b.pct - a.pct)
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={Building2} label="Affaires actives" value={affairesActives} to="/affaires" />
        <KpiCard icon={Users} label="Employés actifs" value={employesActifs} to="/employes" />
        <KpiCard icon={Calendar} label="Heures cette semaine" value={`${heuresSemaine}h`} to="/planning" />
        <KpiCard icon={ClipboardCheck} label="Heures à valider" value={heuresAValider.length} to="/validation-heures" emphasize={heuresAValider.length > 0} />
      </div>

      <MeteoChantiersBloc />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChargeEquipeBloc weekStart={weekStartStr} weekEnd={weekEndStr} />
        {/* Bloc montages J+7 */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Prochains montages (J+7)
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/planning">
                Planning <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {montagesProches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun montage prévu dans les 7 jours</p>
            ) : (
              <ul className="divide-y">
                {montagesProches.map((a) => (
                  <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/affaires/$affaireId"
                        params={{ affaireId: a.id }}
                        className="text-sm font-medium hover:text-primary truncate block"
                      >
                        {a.numero} — {a.nom}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate">
                        {a.client ?? "—"}{a.lieu ? ` · ${a.lieu}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {a.date_montage ? fmtDate(a.date_montage) : "—"}
                    </Badge>
                  </li>
                ))}
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
              <ul className="divide-y">
                {depassements.map((d) => {
                  const tone = d.pct >= 100 ? "destructive" : d.pct >= 90 ? "default" : "secondary";
                  return (
                    <li key={d.affaire_id} className="py-2.5 flex items-center justify-between gap-3">
                      <Link
                        to="/affaires/$affaireId"
                        params={{ affaireId: d.affaire_id }}
                        className="text-sm font-medium hover:text-primary truncate flex-1 min-w-0"
                      >
                        {d.numero} — {d.nom}
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {d.total_assignees}/{d.total_prevues}h
                        </span>
                        <Badge variant={tone} className="text-xs">
                          {d.pct}%
                        </Badge>
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
                  <li key={h.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {h.employe?.prenom} {h.employe?.nom}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {h.affaire?.numero ?? "—"} · {fmtDate(h.date)}
                      </p>
                    </div>
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
                      <Badge variant="outline" className="text-[10px] shrink-0">À valider</Badge>
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
      className={`rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 ${emphasize ? "border-primary/40 bg-primary/5" : "border-border"}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${emphasize ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </Link>
  );
}
