import { useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, AlertTriangle, FileDown, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { usePlanningParPole, type PoleCellRow } from "@/hooks/use-planning-par-pole";
import { PoleDrilldownDialog } from "./PoleDrilldownDialog";

interface Props {
  weekStart: Date;
  weekEnd: Date;
  inclureOpportunites: boolean;
  filtresMetierIds?: number[];
  filtresStatut?: string[];
}

export function StaffingParPole({
  weekStart,
  weekEnd,
  inclureOpportunites,
  filtresMetierIds,
  filtresStatut,
}: Props) {
  const { cells, capacites, loading, error } = usePlanningParPole({
    weekStart,
    weekEnd,
    inclureOpportunites,
    filtresMetierIds,
    filtresStatut,
  });
  const [view, setView] = useState<"compact" | "detail">("compact");
  const [drill, setDrill] = useState<{ chantierId: string; chantierLabel: string; metierId: number; metierLabel: string } | null>(null);

  // Index cellules par (chantier, metier)
  const cellMap = useMemo(() => {
    const map = new Map<string, PoleCellRow>();
    for (const c of cells) map.set(`${c.chantier_id}::${c.metier_id}`, c);
    return map;
  }, [cells]);

  // Liste chantiers (déduplication, tri par numéro)
  const chantiers = useMemo(() => {
    const seen = new Map<string, { id: string; numero: string; nom: string; typologie: string | null; statut: string }>();
    for (const c of cells) {
      if (!seen.has(c.chantier_id)) {
        seen.set(c.chantier_id, {
          id: c.chantier_id,
          numero: c.chantier_numero,
          nom: c.chantier_nom,
          typologie: c.chantier_typologie,
          statut: c.chantier_statut,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }));
  }, [cells]);

  // Métiers à afficher = capacités (ordonnées) éventuellement filtrées
  const metiersToShow = useMemo(() => {
    const filter = filtresMetierIds && filtresMetierIds.length > 0 ? new Set(filtresMetierIds) : null;
    return capacites.filter((m) => !filter || filter.has(m.metier_id));
  }, [capacites, filtresMetierIds]);

  // Totaux par métier (footer)
  const totalsByMetier = useMemo(() => {
    const map = new Map<number, { nb: number; h: number }>();
    for (const c of cells) {
      const cur = map.get(c.metier_id) ?? { nb: 0, h: 0 };
      cur.nb += c.nb_personnes;
      cur.h += Number(c.total_heures);
      map.set(c.metier_id, cur);
    }
    return map;
  }, [cells]);

  // Alertes
  const alertes = useMemo(() => {
    const satures: string[] = [];
    const sousUtilises: string[] = [];
    for (const m of metiersToShow) {
      const cap = m.capacite_totale;
      if (cap === 0) continue;
      const tot = totalsByMetier.get(m.metier_id)?.nb ?? 0;
      const ratio = tot / cap;
      if (ratio > 1.0) satures.push(m.metier_libelle);
      else if (ratio < 0.5) sousUtilises.push(m.metier_libelle);
    }
    return { satures, sousUtilises };
  }, [metiersToShow, totalsByMetier]);

  const handleExport = async () => {
    const { exportPoleMatriceXlsx } = await import("./pole-export-excel");
    await exportPoleMatriceXlsx({ chantiers, metiers: metiersToShow, capacites, cellMap, weekStart, weekEnd });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Erreur : {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bandeau alertes + actions */}
      <div className="flex flex-wrap items-center gap-2">
        {alertes.satures.length > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {alertes.satures.length} pôle{alertes.satures.length > 1 ? "s" : ""} saturé{alertes.satures.length > 1 ? "s" : ""} : {alertes.satures.join(", ")}
          </Badge>
        )}
        {alertes.sousUtilises.length > 0 && (
          <Badge variant="secondary" className="gap-1">
            <Layers className="h-3 w-3" />
            {alertes.sousUtilises.length} pôle{alertes.sousUtilises.length > 1 ? "s" : ""} sous-utilisé{alertes.sousUtilises.length > 1 ? "s" : ""} : {alertes.sousUtilises.join(", ")}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ToggleGroup type="single" size="sm" value={view} onValueChange={(v) => v && setView(v as "compact" | "detail")}>
            <ToggleGroupItem value="compact">Compact</ToggleGroupItem>
            <ToggleGroupItem value="detail">Détaillé</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Exporter Excel
          </Button>
        </div>
      </div>

      {/* Matrice */}
      <div className="relative max-h-[70vh] overflow-auto rounded-md border" role="table" aria-label="Matrice chantier × métier">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-background shadow-sm">
            <tr role="row">
              <th
                role="columnheader"
                className="sticky left-0 z-30 min-w-[260px] border-b border-r bg-background px-3 py-2 text-left font-semibold"
              >
                Chantier
                <div className="text-[10px] font-normal text-muted-foreground">
                  Capacité totale : {capacites.reduce((s, m) => s + m.capacite_totale, 0)} pers.
                </div>
              </th>
              {metiersToShow.map((m) => (
                <th
                  role="columnheader"
                  key={m.metier_id}
                  className="min-w-[110px] border-b border-r px-2 py-2 text-center font-semibold"
                  style={{ borderTopColor: m.metier_couleur, borderTopWidth: 3 }}
                >
                  <div className="truncate">{m.metier_libelle}</div>
                  <div className="text-[10px] font-normal text-muted-foreground">
                    {m.capacite_cdi_cdd} CDI/CDD
                    {m.capacite_interim > 0 ? ` · ${m.capacite_interim} int.` : ""}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {chantiers.length === 0 ? (
              <tr>
                <td colSpan={metiersToShow.length + 1} className="p-8 text-center text-muted-foreground">
                  Aucune assignation sur la période sélectionnée.
                </td>
              </tr>
            ) : (
              chantiers.map((ch) => {
                const isProto = ch.numero.startsWith("9");
                return (
                  <tr
                    key={ch.id}
                    role="row"
                    className={cn(
                      "border-b transition-colors hover:bg-muted/30",
                      isProto && "opacity-60",
                    )}
                  >
                    <td
                      className={cn(
                        "sticky left-0 z-10 border-r bg-background px-3 py-2",
                        isProto && "border-dashed",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold">{ch.numero}</span>
                        {isProto && (
                          <Badge variant="outline" className="h-4 border-dashed px-1 text-[9px]">
                            PRÉV
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground" title={ch.nom}>
                        {ch.nom}
                      </div>
                    </td>
                    {metiersToShow.map((m) => {
                      const cell = cellMap.get(`${ch.id}::${m.metier_id}`);
                      if (!cell) {
                        return (
                          <td
                            key={m.metier_id}
                            className={cn("border-r px-2 py-2 text-center text-muted-foreground/40", isProto && "border-dashed")}
                          >
                            –
                          </td>
                        );
                      }
                      return (
                        <td
                          key={m.metier_id}
                          className={cn(
                            "cursor-pointer border-r px-2 py-2 text-center hover:bg-accent",
                            isProto && "border-dashed",
                          )}
                          onClick={() =>
                            setDrill({
                              chantierId: ch.id,
                              chantierLabel: `${ch.numero} — ${ch.nom}`,
                              metierId: m.metier_id,
                              metierLabel: m.metier_libelle,
                            })
                          }
                          aria-label={`${ch.numero} — ${m.metier_libelle} : ${cell.nb_personnes} personnes, ${cell.total_heures}h`}
                        >
                          <div className="font-semibold">{cell.nb_personnes}p</div>
                          {view === "detail" && (
                            <div className="text-[10px] text-muted-foreground">{cell.total_heures}h</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          <tfoot className="sticky bottom-0 z-20 bg-muted/80 backdrop-blur">
            <tr role="row">
              <td className="sticky left-0 z-30 border-r border-t bg-muted/95 px-3 py-2 text-left text-[11px] font-semibold">
                Total staffé / pôle
              </td>
              {metiersToShow.map((m) => {
                const tot = totalsByMetier.get(m.metier_id)?.nb ?? 0;
                return (
                  <td key={m.metier_id} className="border-r border-t px-2 py-2 text-center text-xs font-semibold">
                    {tot}
                  </td>
                );
              })}
            </tr>
            <tr role="row">
              <td className="sticky left-0 z-30 border-r bg-muted/95 px-3 py-2 text-left text-[11px] font-semibold">
                % utilisation
              </td>
              {metiersToShow.map((m) => {
                const tot = totalsByMetier.get(m.metier_id)?.nb ?? 0;
                const cap = m.capacite_totale;
                if (cap === 0) {
                  return (
                    <td key={m.metier_id} className="border-r px-2 py-2 text-center text-[11px] text-muted-foreground">
                      –
                    </td>
                  );
                }
                const ratio = tot / cap;
                const color =
                  ratio > 1.2 ? "bg-destructive text-destructive-foreground" :
                  ratio > 1.0 ? "bg-amber-500/20 text-amber-900 dark:text-amber-200" :
                  "bg-emerald-500/20 text-emerald-900 dark:text-emerald-200";
                return (
                  <td key={m.metier_id} className={cn("border-r px-2 py-2 text-center text-[11px] font-semibold", color)}>
                    {Math.round(ratio * 100)}%
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="text-[10px] text-muted-foreground">
        Période : {format(weekStart, "EEE d MMM", { locale: fr })} → {format(weekEnd, "EEE d MMM yyyy", { locale: fr })}
      </div>

      {drill && (
        <PoleDrilldownDialog
          open
          onOpenChange={(o) => !o && setDrill(null)}
          chantierId={drill.chantierId}
          chantierLabel={drill.chantierLabel}
          metierId={drill.metierId}
          metierLabel={drill.metierLabel}
          weekStart={weekStart}
          weekEnd={weekEnd}
        />
      )}
    </div>
  );
}
