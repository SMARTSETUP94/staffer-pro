import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  ChevronLeft, ChevronRight, Filter, Loader2,
} from "lucide-react";

import { requireCapability } from "@/lib/capability-guard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { useChargeAtelier, usePrefetchChargeAtelier } from "@/hooks/use-charge-atelier";
import { AffaireFilterMenu } from "@/components/charge/AffaireFilterMenu";
import { ChargeDrillList } from "@/components/charge/ChargeDrillList";
import { isJourFerieFR, isWeekend, labelJourFerieFR } from "@/lib/jours-feries";
import { addDaysISO, buildJourWindow, labelJourCourt, startOfWeekISO, toISO } from "@/lib/planning-atelier";
import {
  buildChargeMatrix, chargeKey, chargeNiveau, computeChargeKpis, filterChargeRows,
  groupCellByAffaire, NIVEAU_CLASS, segmentsParMois, totalColonne, totalLigne,
} from "@/lib/charge-atelier";

const feriesApi = { isWeekend, isFerie: isJourFerieFR, labelFerie: labelJourFerieFR };

const searchSchema = z.object({
  debut: z.string().optional(),
  semaines: z.coerce.number().optional(),
  we: z.coerce.boolean().optional(),
  prospects: z.coerce.boolean().optional(),
  st: z.coerce.boolean().optional(),
  metiers: z.string().optional(),
  affaires: z.string().optional(),
});
type ChargeSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_app/charge")({
  beforeLoad: () => requireCapability("section.planning_fab"),
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Charge atelier — Setup Paris" },
      {
        name: "description",
        content: "Effectif attendu par métier et par jour, tous chantiers confondus.",
      },
    ],
  }),
  component: ChargePage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Page introuvable.</div>,
});

const csvToList = (v: string | undefined) =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function ChargePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const debut = search.debut ?? startOfWeekISO(toISO(new Date()));
  const semaines = [1, 4, 8].includes(search.semaines ?? 0) ? search.semaines! : 4;
  const afficherWe = search.we ?? false;
  const inclureProspects = search.prospects ?? true;
  const exclureSousTraitance = search.st ?? true;
  const metierIds = csvToList(search.metiers).map(Number).filter((n) => !Number.isNaN(n));
  const affaireIds = csvToList(search.affaires);

  const nbJours = semaines * 7;
  const fin = addDaysISO(debut, nbJours - 1);

  const { data, isLoading, isFetching, isPlaceholderData } = useChargeAtelier(debut, fin);

  // Précharge les fenêtres adjacentes pour une navigation instantanée.
  const prevDebut = addDaysISO(debut, -7 * semaines);
  const nextDebut = addDaysISO(debut, 7 * semaines);
  usePrefetchChargeAtelier([
    { from: prevDebut, to: addDaysISO(prevDebut, nbJours - 1) },
    { from: nextDebut, to: addDaysISO(nextDebut, nbJours - 1) },
  ]);
  const [drill, setDrill] = useState<{ metierId: number; date: string } | null>(null);

  const setSearch = (patch: Partial<ChargeSearch>) =>
    void navigate({ to: ".", search: (p: ChargeSearch) => ({ ...p, ...patch }) });

  const jours = useMemo(
    () => buildJourWindow(debut, nbJours, feriesApi).filter((j) => afficherWe || !j.weekend),
    [debut, nbJours, afficherWe],
  );
  const dates = useMemo(() => jours.map((j) => j.date), [jours]);
  const segments = useMemo(() => segmentsParMois(dates), [dates]);

  const rows = useMemo(
    () =>
      filterChargeRows(data?.rows ?? [], {
        metierIds, affaireIds, inclureProspects, exclureSousTraitance,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.rows, search.metiers, search.affaires, inclureProspects, exclureSousTraitance],
  );

  const matrix = useMemo(() => buildChargeMatrix(rows), [rows]);

  const metiersAffiches = useMemo(
    () =>
      (data?.metiers ?? []).filter((m) => metierIds.length === 0 || metierIds.includes(m.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.metiers, search.metiers],
  );

  const kpis = useMemo(
    () => computeChargeKpis(matrix, metiersAffiches, dates),
    [matrix, metiersAffiches, dates],
  );

  const capaciteTotale = metiersAffiches.reduce((a, m) => a + (m.capacite_jour ?? 0), 0);
  const metierIdsAffiches = metiersAffiches.map((m) => m.id);

  const toggleCsv = (key: "metiers" | "affaires", value: string) => {
    const current = csvToList(search[key]);
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setSearch({ [key]: next.join(",") || undefined } as Partial<ChargeSearch>);
  };

  const drillCell = drill ? matrix.get(chargeKey(drill.metierId, drill.date)) : undefined;
  const drillMetier = metiersAffiches.find((m) => m.id === drill?.metierId);
  const drillGroupes = groupCellByAffaire(drillCell);

  return (
    <div className="space-y-4 p-4 pb-16 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Charge atelier</h1>
          <p className="text-sm text-muted-foreground">
            Effectif attendu par métier et par jour, tous chantiers confondus.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Période précédente"
            onClick={() => setSearch({ debut: addDaysISO(debut, -7 * semaines) })}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline"
            onClick={() => setSearch({ debut: startOfWeekISO(toISO(new Date())) })}>
            Aujourd'hui
          </Button>
          <Button size="icon" variant="outline" aria-label="Période suivante"
            onClick={() => setSearch({ debut: addDaysISO(debut, 7 * semaines) })}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex rounded-md border p-0.5">
            {[1, 4, 8].map((n) => (
              <Button key={n} size="sm" variant={semaines === n ? "secondary" : "ghost"}
                onClick={() => setSearch({ semaines: n })}>
                {n} sem.
              </Button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Jours en surcharge</p>
            <p className={cn("text-2xl font-semibold", kpis.joursSurcharge > 0 && "text-destructive")}>
              {kpis.joursSurcharge}
              <span className="ml-1 text-sm font-normal text-muted-foreground">/ {dates.length}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Métier le plus tendu</p>
            <p className="truncate text-2xl font-semibold">
              {kpis.metierTendu?.libelle ?? "—"}
            </p>
            {kpis.metierTendu && (
              <p className="text-xs text-destructive">
                +{kpis.metierTendu.depassement} pers·j au-dessus de la capacité
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Personnes-jours planifiées</p>
            <p className="text-2xl font-semibold">
              {kpis.persJoursPlanifiees}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                dont {kpis.persJoursNommees} nommée{kpis.persJoursNommees > 1 ? "s" : ""}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Filter className="mr-1.5 h-4 w-4" />
              Métiers{metierIds.length > 0 ? ` (${metierIds.length})` : ""}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel>Filtrer par métier</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(data?.metiers ?? []).map((m) => (
              <DropdownMenuCheckboxItem
                key={m.id}
                checked={metierIds.includes(m.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggleCsv("metiers", String(m.id))}
              >
                {m.libelle}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <AffaireFilterMenu
          affaires={data?.affaires ?? []}
          selected={affaireIds}
          onToggle={(id) => toggleCsv("affaires", id)}
          onClear={() => setSearch({ affaires: undefined })}
        />

        <label className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
          <Checkbox checked={inclureProspects}
            onCheckedChange={(c) => setSearch({ prospects: c === true ? undefined : false })} />
          <span>Inclure les prospects</span>
        </label>
        <label className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
          <Checkbox checked={exclureSousTraitance}
            onCheckedChange={(c) => setSearch({ st: c === true ? undefined : false })} />
          <span>Exclure la sous-traitance</span>
        </label>
        <label className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
          <Checkbox checked={afficherWe}
            onCheckedChange={(c) => setSearch({ we: c === true ? true : undefined })} />
          <Label className="cursor-pointer font-normal">Afficher les week-ends</Label>
        </label>
      </div>

      {isFetching && !isLoading && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Actualisation de la période…
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Aucune charge planifiée sur cette période. Posez des effectifs depuis l'onglet
          Planning d'un chantier.
        </div>
      ) : (
        <div className={cn("overflow-x-auto rounded-lg border transition-opacity", isPlaceholderData && "opacity-60")}>
          <table className="w-max border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-[11px] text-muted-foreground">
                <th className="sticky left-0 z-20 bg-muted/40" />
                <th />
                {segments.map((s, i) => (
                  <th key={`${s.label}-${i}`} colSpan={s.span} className="px-1 py-1 text-left font-medium">
                    {s.label}
                  </th>
                ))}
                <th />
              </tr>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-20 min-w-[190px] bg-muted/40 p-2 text-left font-medium">
                  Métier
                </th>
                <th className="min-w-[70px] p-2 text-center text-xs font-medium">Capacité / j</th>
                {jours.map((j) => (
                  <th
                    key={j.date}
                    title={j.ferieLabel ?? undefined}
                    className={cn(
                      "min-w-[44px] p-1 text-center text-[11px] font-medium",
                      (j.weekend || j.ferie) && "bg-muted text-muted-foreground",
                    )}
                  >
                    {labelJourCourt(j.date)}
                    {j.ferie && <span className="block text-[9px] text-amber-600">férié</span>}
                  </th>
                ))}
                <th className="min-w-[60px] p-2 text-center text-xs font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {metiersAffiches.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="sticky left-0 z-10 bg-background p-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: m.couleur ?? "hsl(var(--muted-foreground))" }} aria-hidden />
                      <span className="truncate">{m.libelle}</span>
                    </span>
                  </td>
                  <td className="border-l p-1 text-center text-xs text-muted-foreground tabular-nums">
                    {m.capacite_jour ?? "—"}
                  </td>
                  {jours.map((j) => {
                    const cell = matrix.get(chargeKey(m.id, j.date));
                    const nb = cell?.nbPers ?? 0;
                    const niveau = chargeNiveau(nb, m.capacite_jour);
                    return (
                      <td key={j.date} className={cn("border-l p-0.5", (j.weekend || j.ferie) && "bg-muted/50")}>
                        <button
                          type="button"
                          disabled={nb === 0}
                          onClick={() => setDrill({ metierId: m.id, date: j.date })}
                          className={cn(
                            "h-8 w-full rounded text-center text-sm tabular-nums transition-colors",
                            NIVEAU_CLASS[niveau],
                            nb > 0 && "hover:ring-1 hover:ring-primary",
                          )}
                          aria-label={`${m.libelle} ${j.date} : ${nb} personne(s)`}
                        >
                          {nb || "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-l p-2 text-center font-medium tabular-nums">
                    {totalLigne(matrix, m.id, dates)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 bg-muted/30 font-medium">
                <td className="sticky left-0 z-10 bg-muted/30 p-2">TOTAL</td>
                <td className="border-l p-1 text-center text-xs text-muted-foreground tabular-nums">
                  {capaciteTotale || "—"}
                </td>
                {jours.map((j) => {
                  const t = totalColonne(matrix, metierIdsAffiches, j.date);
                  return (
                    <td key={j.date}
                      className={cn(
                        "border-l p-1 text-center tabular-nums",
                        capaciteTotale > 0 && t > capaciteTotale && "text-destructive",
                        (j.weekend || j.ferie) && "bg-muted/50",
                      )}>
                      {t || "·"}
                    </td>
                  );
                })}
                <td className="border-l p-2 text-center tabular-nums">
                  {metierIdsAffiches.reduce((a, id) => a + totalLigne(matrix, id, dates), 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{drillMetier?.libelle}</SheetTitle>
            <SheetDescription>
              {drill?.date} · {drillCell?.nbPers ?? 0} personne(s) attendue(s)
              {drillMetier?.capacite_jour ? ` · capacité ${drillMetier.capacite_jour}/j` : ""}
            </SheetDescription>
          </SheetHeader>
          <ChargeDrillList groupes={drillGroupes} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
