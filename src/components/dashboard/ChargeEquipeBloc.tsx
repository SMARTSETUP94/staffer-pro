import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Users, ArrowRight, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMetiers } from "@/hooks/use-metiers";

interface Props {
  weekStart: string; // yyyy-MM-dd lundi
  weekEnd: string; // yyyy-MM-dd dimanche
}

interface Row {
  metierId: number;
  libelle: string;
  couleur: string;
  cdiH: number;
  autresH: number;
  totalH: number;
}

// Compte le nombre de jours ouvrés (lun-ven) entre 2 dates incluses
function workdaysBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const d = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  while (d <= end) {
    const dow = d.getDay(); // 0=dim, 6=sam
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function ChargeEquipeBloc({ weekStart, weekEnd }: Props) {
  const { metiers } = useMetiers();
  const [rows, setRows] = useState<Row[]>([]);
  const [cdiJoursLibres, setCdiJoursLibres] = useState<
    { employeId: string; nom: string; prenom: string; joursLibres: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (metiers.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [empRes, assRes, absRes] = await Promise.all([
        supabase
          .from("employes")
          .select("id, prenom, nom, type_contrat, metier_principal_id")
          .eq("actif", true)
          .eq("non_staffing", false),
        supabase
          .from("assignations")
          .select("date, demi_journee, heures, employe_id, metier_id")
          .gte("date", weekStart)
          .lte("date", weekEnd),
        supabase
          .from("absences")
          .select("employe_id, date_debut, date_fin, demi_journee")
          .lte("date_debut", weekEnd)
          .gte("date_fin", weekStart),
      ]);
      if (cancelled) return;

      const employes = empRes.data ?? [];
      const empById = new Map(employes.map((e) => [e.id as string, e]));

      // Heures par métier x type contrat
      const acc = new Map<number, { cdi: number; autres: number }>();
      for (const a of assRes.data ?? []) {
        const emp = empById.get(a.employe_id as string);
        const isCdi = emp?.type_contrat === "CDI";
        const cur = acc.get(a.metier_id as number) ?? { cdi: 0, autres: 0 };
        const h = Number(a.heures ?? 0);
        if (isCdi) cur.cdi += h;
        else cur.autres += h;
        acc.set(a.metier_id as number, cur);
      }

      const r: Row[] = metiers
        .map((m) => {
          const a = acc.get(m.id) ?? { cdi: 0, autres: 0 };
          return {
            metierId: m.id,
            libelle: m.libelle,
            couleur: m.couleur,
            cdiH: a.cdi,
            autresH: a.autres,
            totalH: a.cdi + a.autres,
          };
        })
        .filter((r) => r.totalH > 0)
        .sort((a, b) => b.totalH - a.totalH);

      // Jours non affectés CDI : pour chaque CDI, compter (jours ouvrés - jours staffés ou absents)
      const workdays = workdaysBetween(weekStart, weekEnd);
      const totalSlotsPerEmp = workdays.length; // 5 normalement

      // map employe -> set de "date|demi" occupés (1 journée = 1 slot, AM+PM = 1 slot via dédoublonnage par date)
      const occupied = new Map<string, Set<string>>();
      const markDay = (empId: string, date: string) => {
        if (!occupied.has(empId)) occupied.set(empId, new Set());
        occupied.get(empId)!.add(date);
      };
      // assignations : si demi_journee=JOURNEE -> jour entier, sinon il faut AM+PM pour compter
      // Pour simplifier (jour libre = aucune assignation ce jour), on marque le jour dès qu'il y a une assignation
      for (const a of assRes.data ?? []) {
        const emp = empById.get(a.employe_id as string);
        if (emp?.type_contrat !== "CDI") continue;
        markDay(a.employe_id as string, a.date as string);
      }
      // absences : marquer chaque jour ouvré dans la plage
      for (const ab of absRes.data ?? []) {
        const emp = empById.get(ab.employe_id as string);
        if (emp?.type_contrat !== "CDI") continue;
        const start = ab.date_debut > weekStart ? ab.date_debut : weekStart;
        const end = ab.date_fin < weekEnd ? ab.date_fin : weekEnd;
        for (const d of workdaysBetween(start, end)) {
          markDay(ab.employe_id as string, d);
        }
      }

      const cdis = employes.filter((e) => e.type_contrat === "CDI");
      const libres = cdis
        .map((e) => {
          const occ = occupied.get(e.id)?.size ?? 0;
          return {
            employeId: e.id,
            prenom: e.prenom,
            nom: e.nom,
            joursLibres: Math.max(0, totalSlotsPerEmp - occ),
          };
        })
        .filter((x) => x.joursLibres > 0)
        .sort((a, b) => b.joursLibres - a.joursLibres);

      setRows(r);
      setCdiJoursLibres(libres);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [metiers, weekStart, weekEnd]);

  const totalCdi = rows.reduce((a, r) => a + r.cdiH, 0);
  const totalAutres = rows.reduce((a, r) => a + r.autresH, 0);
  const totalJoursLibres = cdiJoursLibres.reduce((a, x) => a + x.joursLibres, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Charge équipe — semaine en cours
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/planning">
            Planning <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <>
            {/* Totaux */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
                  <span className="text-muted-foreground">CDI</span>
                  <span className="font-semibold tabular-nums">{totalCdi}h</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/60" aria-hidden />
                  <span className="text-muted-foreground">Autres</span>
                  <span className="font-semibold tabular-nums">{totalAutres}h</span>
                </span>
              </div>
              <span className="font-semibold tabular-nums">{totalCdi + totalAutres}h total</span>
            </div>

            {/* Barres par métier */}
            {rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Aucune assignation cette semaine
              </p>
            ) : (
              <ul className="space-y-3">
                {rows.map((r) => {
                  const max = Math.max(...rows.map((x) => x.totalH), 1);
                  const cdiPct = (r.cdiH / max) * 100;
                  const autresPct = (r.autresH / max) * 100;
                  return (
                    <li key={r.metierId} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: r.couleur }}
                            aria-hidden
                          />
                          <span className="truncate font-medium">{r.libelle}</span>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums">{r.totalH}h</span>
                      </div>
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full"
                          style={{
                            width: `${cdiPct}%`,
                            backgroundColor: r.couleur,
                          }}
                          aria-hidden
                        />
                        <div
                          className="h-full opacity-40"
                          style={{
                            width: `${autresPct}%`,
                            backgroundColor: r.couleur,
                          }}
                          aria-hidden
                        />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                        <span>
                          CDI <b className="text-foreground">{r.cdiH}h</b>
                        </span>
                        <span>
                          Autres <b className="text-foreground">{r.autresH}h</b>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* CDI sans affectation */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between text-xs mb-2">
                <div className="flex items-center gap-1.5">
                  <UserX className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="font-medium">CDI sans affectation</span>
                </div>
                <span className="font-semibold tabular-nums">
                  {totalJoursLibres} j · {cdiJoursLibres.length} pers.
                </span>
              </div>
              {cdiJoursLibres.length === 0 ? (
                <p className="text-xs text-muted-foreground">Tous les CDI sont staffés 🎉</p>
              ) : (
                <ul className="space-y-1">
                  {cdiJoursLibres.slice(0, 6).map((x) => (
                    <li
                      key={x.employeId}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate">
                        {x.prenom} {x.nom}
                      </span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {x.joursLibres}j libre{x.joursLibres > 1 ? "s" : ""}
                      </span>
                    </li>
                  ))}
                  {cdiJoursLibres.length > 6 && (
                    <li className="text-xs text-muted-foreground italic">
                      + {cdiJoursLibres.length - 6} autre{cdiJoursLibres.length - 6 > 1 ? "s" : ""}…
                    </li>
                  )}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
