import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
} from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, Trophy, TrendingUp, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { normalizeName } from "@/lib/string-normalize";

export const Route = createFileRoute("/_app/interimaires")({
  head: () => ({
    meta: [
      { title: "Intérimaires — Classement staffing" },
      {
        name: "description",
        content: "Classement des intérimaires les plus staffés par période.",
      },
    ],
  }),
  component: InterimairesPage,
});

type Periode = "semaine" | "mois" | "annee";

interface InterimRow {
  id: string;
  prenom: string;
  nom: string;
  type_contrat: "Interim" | "Independant";
  agence_interim: string | null;
  metier_principal_id: number;
  metier_libelle: string;
  metier_couleur: string;
}

interface AssignRow {
  employe_id: string;
  demi_journee: "AM" | "PM" | "JOURNEE";
  heures: number;
  date: string;
}

function getPeriodRange(periode: Periode, ref: Date) {
  if (periode === "semaine") {
    return {
      start: startOfWeek(ref, { weekStartsOn: 1 }),
      end: endOfWeek(ref, { weekStartsOn: 1 }),
    };
  }
  if (periode === "mois") {
    return { start: startOfMonth(ref), end: endOfMonth(ref) };
  }
  return { start: startOfYear(ref), end: endOfYear(ref) };
}

function periodLabel(periode: Periode, start: Date, end: Date): string {
  if (periode === "semaine") {
    return `Semaine ${format(start, "I", { locale: fr })} — ${format(start, "d MMM", { locale: fr })} → ${format(end, "d MMM yyyy", { locale: fr })}`;
  }
  if (periode === "mois") {
    return format(start, "MMMM yyyy", { locale: fr });
  }
  return format(start, "yyyy");
}

function InterimairesPage() {
  const [periode, setPeriode] = useState<Periode>("mois");
  const [refDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [interims, setInterims] = useState<InterimRow[]>([]);
  const [assigns, setAssigns] = useState<AssignRow[]>([]);
  const [search, setSearch] = useState("");

  const { start, end } = useMemo(() => getPeriodRange(periode, refDate), [periode, refDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const startStr = format(start, "yyyy-MM-dd");
    const endStr = format(end, "yyyy-MM-dd");
    Promise.all([
      supabase
        .from("employes")
        .select(
          "id, prenom, nom, type_contrat, agence_interim, metier_principal_id, metiers!employes_metier_principal_id_fkey(libelle, couleur)",
        )
        .in("type_contrat", ["Interim", "Independant"])
        .eq("actif", true)
        .order("nom"),
      supabase
        .from("assignations")
        .select("employe_id, demi_journee, heures, date")
        .gte("date", startStr)
        .lte("date", endStr),
    ]).then(([eRes, aRes]) => {
      if (cancelled) return;
      if (eRes.data) {
        const rows: InterimRow[] = eRes.data.map((e: any) => ({
          id: e.id,
          prenom: e.prenom,
          nom: e.nom,
          type_contrat: e.type_contrat,
          agence_interim: e.agence_interim,
          metier_principal_id: e.metier_principal_id,
          metier_libelle: e.metiers?.libelle ?? "—",
          metier_couleur: e.metiers?.couleur ?? "#94a3b8",
        }));
        setInterims(rows);
      }
      if (aRes.data) setAssigns(aRes.data as AssignRow[]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [start.getTime(), end.getTime()]);

  // Calcule pour chaque intérimaire: demi-journées, jours équivalents, heures, nb assignations
  const ranking = useMemo(() => {
    const stats = new Map<
      string,
      { demis: number; heures: number; nbAssign: number; jours: Set<string> }
    >();
    for (const a of assigns) {
      const s = stats.get(a.employe_id) ?? { demis: 0, heures: 0, nbAssign: 0, jours: new Set<string>() };
      s.demis += a.demi_journee === "JOURNEE" ? 1 : 0.5;
      s.heures += Number(a.heures || 0);
      s.nbAssign += 1;
      s.jours.add(a.date);
      stats.set(a.employe_id, s);
    }
    const q = normalizeName(search.trim());
    return interims
      .filter((e) => {
        if (!q) return true;
        return normalizeName(`${e.prenom} ${e.nom} ${e.agence_interim ?? ""}`).includes(q);
      })
      .map((e) => {
        const s = stats.get(e.id);
        return {
          ...e,
          demis: s?.demis ?? 0,
          heures: s?.heures ?? 0,
          nbAssign: s?.nbAssign ?? 0,
          nbJoursDistincts: s?.jours.size ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.demis !== a.demis) return b.demis - a.demis;
        return b.heures - a.heures;
      });
  }, [interims, assigns, search]);

  const totalDemis = ranking.reduce((s, r) => s + r.demis, 0);
  const totalHeures = ranking.reduce((s, r) => s + r.heures, 0);
  const nbStaffes = ranking.filter((r) => r.demis > 0).length;
  const maxDemis = ranking[0]?.demis ?? 0;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Classement intérimaires</h1>
            <p className="text-xs text-muted-foreground">
              {periodLabel(periode, start, end)}
            </p>
          </div>
        </div>
        <Tabs value={periode} onValueChange={(v) => setPeriode(v as Periode)}>
          <TabsList>
            <TabsTrigger value="semaine">Semaine</TabsTrigger>
            <TabsTrigger value="mois">Mois</TabsTrigger>
            <TabsTrigger value="annee">Année</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Intérim. staffés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nbStaffes}</div>
            <div className="text-[11px] text-muted-foreground">/ {ranking.length} actifs</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total demi-journées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDemis.toFixed(1)}</div>
            <div className="text-[11px] text-muted-foreground">
              ≈ {(totalDemis / 2).toFixed(1)} jours
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total heures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHeures.toFixed(0)}h</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Top staffé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="truncate text-base font-bold">
              {ranking[0] && ranking[0].demis > 0
                ? `${ranking[0].prenom} ${ranking[0].nom}`
                : "—"}
            </div>
            {ranking[0] && ranking[0].demis > 0 && (
              <div className="text-[11px] text-muted-foreground">
                {ranking[0].demis.toFixed(1)} demi-journées
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Rechercher un intérimaire ou agence…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Intérimaire</TableHead>
                <TableHead>Métier</TableHead>
                <TableHead>Agence / Type</TableHead>
                <TableHead className="text-right">Demi-journées</TableHead>
                <TableHead className="text-right">Jours équiv.</TableHead>
                <TableHead className="text-right">Heures</TableHead>
                <TableHead className="text-right">Jours distincts</TableHead>
                <TableHead className="w-[140px]">Activité</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                    Aucun intérimaire / indépendant actif.
                  </TableCell>
                </TableRow>
              ) : (
                ranking.map((r, idx) => {
                  const pct = maxDemis > 0 ? (r.demis / maxDemis) * 100 : 0;
                  const isTop3 = r.demis > 0 && idx < 3;
                  return (
                    <TableRow key={r.id} className={cn(r.demis === 0 && "opacity-60")}>
                      <TableCell className="text-center">
                        {isTop3 ? (
                          <span
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                              idx === 0 && "bg-primary text-primary-foreground",
                              idx === 1 && "bg-secondary text-secondary-foreground",
                              idx === 2 && "bg-muted text-foreground",
                            )}
                          >
                            {idx + 1}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{idx + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {r.prenom} {r.nom}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: r.metier_couleur }}
                          />
                          {r.metier_libelle}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.agence_interim ? (
                          <span className="truncate">{r.agence_interim}</span>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {r.type_contrat}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {r.demis.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {(r.demis / 2).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {r.heures.toFixed(0)}h
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {r.nbJoursDistincts}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {idx === 0 && r.demis > 0 && (
                            <TrendingUp className="h-3 w-3 text-primary" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
