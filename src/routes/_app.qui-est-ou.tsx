import { useMemo } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AlertTriangle, ChevronLeft, ChevronRight, Filter, Loader2, Search } from "lucide-react";

import { requireCapability } from "@/lib/capability-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { useQuiEstOu } from "@/hooks/use-qui-est-ou";
import { isJourFerieFR, isWeekend, labelJourFerieFR } from "@/lib/jours-feries";
import { addDaysISO, buildJourWindow, labelJourCourt, startOfWeekISO, toISO } from "@/lib/planning-atelier";
import {
  ABSENCE_CELL_LABEL, absencesForCell, affaireColor, affaireShortLabel, buildAffaireIndex,
  buildAffectationIndex, cellKey, computeEcartEffectif, computeOccupation, detectAnomalies,
  filterPersonnes, formatJoursPersonne, formatTaux, groupByMetier,
  type QuiAffaire, type QuiAffectation,
} from "@/lib/qui-est-ou";

const feriesApi = { isWeekend, isFerie: isJourFerieFR, labelFerie: labelJourFerieFR };

const searchSchema = z.object({
  debut: z.string().optional(),
  semaines: z.coerce.number().optional(),
  vue: z.string().optional(),
  metiers: z.string().optional(),
  affaires: z.string().optional(),
  q: z.string().optional(),
  masquer: z.coerce.boolean().optional(),
  anomalies: z.coerce.boolean().optional(),
});
type QuiSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_app/qui-est-ou")({
  beforeLoad: () => requireCapability("section.planning_fab"),
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Qui est où — Setup Paris" },
      {
        name: "description",
        content: "Planning nominatif par personne et par jour : affectations, absences et anomalies.",
      },
      { property: "og:title", content: "Qui est où — planning par personne" },
      {
        property: "og:description",
        content: "Vue symétrique de la charge atelier : qui est disponible, où est chacun cette semaine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuiEstOuPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Page introuvable.</div>,
});

const csvToList = (v: string | undefined) =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function QuiEstOuPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const debut = search.debut ?? startOfWeekISO(toISO(new Date()));
  const semaines = search.semaines === 2 ? 2 : 1;
  const parChantier = search.vue === "chantier";
  const metierIds = csvToList(search.metiers).map(Number).filter((n) => !Number.isNaN(n));
  const affaireIds = csvToList(search.affaires);
  const recherche = search.q ?? "";
  const masquerSansAffectation = search.masquer ?? false;
  const anomaliesSeulement = search.anomalies ?? false;

  const nbJours = semaines * 7;
  const fin = addDaysISO(debut, nbJours - 1);
  const { data, isLoading, isPlaceholderData } = useQuiEstOu(debut, fin);

  const setSearch = (patch: Partial<QuiSearch>) =>
    void navigate({ to: ".", search: (p: QuiSearch) => ({ ...p, ...patch }) });

  const jours = useMemo(() => buildJourWindow(debut, nbJours, feriesApi), [debut, nbJours]);
  const dates = useMemo(() => jours.map((j) => j.date), [jours]);
  const datesOuvrees = useMemo(
    () => jours.filter((j) => !j.weekend && !j.ferie).map((j) => j.date),
    [jours],
  );

  const personnes = data?.personnes ?? [];
  const absences = data?.absences ?? [];
  const affectations = data?.affectations ?? [];

  const index = useMemo(() => buildAffectationIndex(affectations), [affectations]);
  const affaireById = useMemo(
    () => new Map((data?.affaires ?? []).map((a) => [a.id, a] as const)),
    [data?.affaires],
  );

  const anomalies = useMemo(
    () => detectAnomalies(personnes, dates, index, absences),
    [personnes, dates, index, absences],
  );
  const anomalieCells = useMemo(
    () => new Map(anomalies.map((a) => [cellKey(a.employe_id, a.date), a.type] as const)),
    [anomalies],
  );
  const anomaliePersonnes = useMemo(
    () => new Set(anomalies.map((a) => a.employe_id)),
    [anomalies],
  );

  const personnesFiltrees = useMemo(
    () =>
      filterPersonnes(
        personnes,
        { metierIds, affaireIds, recherche, masquerSansAffectation, anomaliesSeulement },
        index,
        dates,
        anomaliePersonnes,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      personnes, search.metiers, search.affaires, recherche, masquerSansAffectation,
      anomaliesSeulement, index, dates, anomaliePersonnes,
    ],
  );

  const groupes = useMemo(
    () => groupByMetier(personnesFiltrees, data?.metiers ?? []),
    [personnesFiltrees, data?.metiers],
  );

  const kpis = useMemo(
    () => computeOccupation(personnesFiltrees, datesOuvrees, index, absences),
    [personnesFiltrees, datesOuvrees, index, absences],
  );

  const ecarts = useMemo(
    () =>
      computeEcartEffectif(
        data?.prevu ?? [],
        personnes,
        affectations.filter((a) => dates.includes(a.date)),
        data?.metiers ?? [],
      ),
    [data?.prevu, personnes, affectations, dates, data?.metiers],
  );

  const affaireIndex = useMemo(() => buildAffaireIndex(affectations), [affectations]);
  const affairesAffichees = useMemo(() => {
    const visibles = new Set(personnesFiltrees.map((p) => p.id));
    const ids = new Set(
      affectations.filter((a) => visibles.has(a.employe_id)).map((a) => a.affaire_id),
    );
    return (data?.affaires ?? []).filter(
      (a) => ids.has(a.id) && (affaireIds.length === 0 || affaireIds.includes(a.id)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.affaires, affectations, personnesFiltrees, search.affaires]);

  const prenomOf = useMemo(
    () => new Map(personnes.map((p) => [p.id, p.prenom || p.nom] as const)),
    [personnes],
  );

  const toggleCsv = (key: "metiers" | "affaires", value: string) => {
    const current = csvToList(search[key]);
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setSearch({ [key]: next.join(",") || undefined } as Partial<QuiSearch>);
  };

  const aucuneAffectation = !isLoading && affectations.length === 0;

  return (
    <div className="space-y-4 p-4 pb-16 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Qui est où</h1>
          <p className="text-sm text-muted-foreground">
            Planning nominatif : une ligne par personne, une colonne par jour.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Période précédente"
            onClick={() => setSearch({ debut: addDaysISO(debut, -7 * semaines) })}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline"
            onClick={() => setSearch({ debut: startOfWeekISO(toISO(new Date())) })}>
            Cette semaine
          </Button>
          <Button size="icon" variant="outline" aria-label="Période suivante"
            onClick={() => setSearch({ debut: addDaysISO(debut, 7 * semaines) })}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex rounded-md border p-0.5">
            {[1, 2].map((n) => (
              <Button key={n} size="sm" variant={semaines === n ? "secondary" : "ghost"}
                onClick={() => setSearch({ semaines: n === 1 ? undefined : n })}>
                {n} sem.
              </Button>
            ))}
          </div>
          <div className="flex rounded-md border p-0.5">
            <Button size="sm" variant={!parChantier ? "secondary" : "ghost"}
              onClick={() => setSearch({ vue: undefined })}>
              Par personne
            </Button>
            <Button size="sm" variant={parChantier ? "secondary" : "ghost"}
              onClick={() => setSearch({ vue: "chantier" })}>
              Par chantier
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Taux d'occupation</p>
            <p className="text-2xl font-semibold">{formatTaux(kpis.tauxOccupation)}</p>
            <p className="text-xs text-muted-foreground">
              {formatJoursPersonne(kpis.joursAffectes)} / {formatJoursPersonne(kpis.joursOuvrables)} j·pers
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Jours-personnes disponibles</p>
            <p className="text-2xl font-semibold">{formatJoursPersonne(kpis.joursDisponibles)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Personnes en absence</p>
            <p className="text-2xl font-semibold">{kpis.personnesEnAbsence}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <button
              type="button"
              onClick={() => setSearch({ anomalies: anomaliesSeulement ? undefined : true })}
              className={cn(
                "w-full rounded-lg p-3 text-left transition-colors hover:bg-muted/60",
                anomaliesSeulement && "bg-destructive/10",
              )}
              aria-pressed={anomaliesSeulement}
            >
              <p className="text-xs text-muted-foreground">Anomalies détectées</p>
              <p className={cn("text-2xl font-semibold", anomalies.length > 0 && "text-destructive")}>
                {anomalies.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {anomaliesSeulement ? "Filtre actif — cliquer pour lever" : "Cliquer pour filtrer"}
              </p>
            </button>
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Filter className="mr-1.5 h-4 w-4" />
              Chantiers{affaireIds.length > 0 ? ` (${affaireIds.length})` : ""}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel>Filtrer par chantier</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(data?.affaires ?? []).map((a) => (
              <DropdownMenuCheckboxItem
                key={a.id}
                checked={affaireIds.includes(a.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggleCsv("affaires", a.id)}
              >
                {a.numero} — {a.nom}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={recherche}
            onChange={(e) => setSearch({ q: e.target.value || undefined })}
            placeholder="Rechercher une personne"
            aria-label="Rechercher une personne"
            className="h-9 w-56 pl-8"
          />
        </div>

        <label className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
          <Checkbox
            checked={masquerSansAffectation}
            onCheckedChange={(c) => setSearch({ masquer: c === true ? true : undefined })}
          />
          <span>Masquer les personnes sans affectation</span>
        </label>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : aucuneAffectation ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Aucune affectation nominative sur cette période. Les personnes sont nommées depuis
          l'onglet Planning d'un chantier.
        </div>
      ) : (
        <div className={cn("overflow-x-auto rounded-lg border transition-opacity", isPlaceholderData && "opacity-60")}>
          <table className="w-max border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-20 min-w-[210px] bg-muted/40 p-2 text-left font-medium">
                  {parChantier ? "Chantier" : "Personne"}
                </th>
                {jours.map((j) => (
                  <th
                    key={j.date}
                    title={j.ferieLabel ?? undefined}
                    className={cn(
                      "min-w-[112px] p-1 text-center text-[11px] font-medium",
                      (j.weekend || j.ferie) && "bg-muted text-muted-foreground",
                    )}
                  >
                    {labelJourCourt(j.date)}
                    {j.ferie && <span className="block text-[9px] text-amber-600">férié</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parChantier
                ? affairesAffichees.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <th className="sticky left-0 z-10 bg-background p-2 text-left align-top font-normal">
                        <Link
                          to="/affaires/$affaireId/planning-atelier"
                          params={{ affaireId: a.id }}
                          className="text-sm font-medium hover:underline"
                        >
                          {a.numero} — {a.nom}
                        </Link>
                      </th>
                      {jours.map((j) => {
                        const cell = affaireIndex.get(`${a.id}::${j.date}`) ?? [];
                        const visibles = cell.filter((c) =>
                          personnesFiltrees.some((p) => p.id === c.employe_id),
                        );
                        return (
                          <td
                            key={j.date}
                            className={cn(
                              "border-l p-1 align-top",
                              (j.weekend || j.ferie) && "bg-muted/50",
                            )}
                          >
                            {visibles.length === 0 ? (
                              <span className="text-[11px] text-muted-foreground/50">—</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {visibles.map((c) => (
                                  <li key={c.id} className="truncate text-[11px]">
                                    {prenomOf.get(c.employe_id) ?? "—"}
                                    {c.demi_journee !== "JOURNEE" && (
                                      <span className="ml-1 text-muted-foreground">
                                        {c.demi_journee}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                : groupes.map((g) => (
                    <>
                      <tr key={`g-${g.metier?.id ?? "sans"}`} className="border-b bg-muted/30">
                        <th
                          colSpan={jours.length + 1}
                          className="sticky left-0 p-1.5 text-left text-xs font-semibold uppercase tracking-wide"
                        >
                          {g.metier?.libelle ?? "Sans métier"}
                          <span className="ml-2 font-normal text-muted-foreground">
                            {g.personnes.length} personne{g.personnes.length > 1 ? "s" : ""}
                          </span>
                        </th>
                      </tr>
                      {g.personnes.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <th className="sticky left-0 z-10 bg-background p-2 text-left align-top text-sm font-normal">
                            {p.prenom} {p.nom}
                          </th>
                          {jours.map((j) => {
                            const cell = index.get(cellKey(p.id, j.date)) ?? [];
                            const abs = absencesForCell(absences, p.id, j.date);
                            const anomalie = anomalieCells.get(cellKey(p.id, j.date));
                            return (
                              <td
                                key={j.date}
                                className={cn(
                                  "border-l p-1 align-top",
                                  (j.weekend || j.ferie) && "bg-muted/50",
                                  anomalie && "border border-destructive bg-destructive/5",
                                )}
                              >
                                {anomalie && (
                                  <span
                                    className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-destructive"
                                    title={
                                      anomalie === "absent"
                                        ? "Affecté alors qu'absent"
                                        : "Double affectation"
                                    }
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    {anomalie === "absent" ? "absent" : "double"}
                                  </span>
                                )}
                                {abs.length > 0 && (
                                  <span className="block text-[11px] italic text-muted-foreground">
                                    {ABSENCE_CELL_LABEL[abs[0]!.type]}
                                    {abs[0]!.demi_journee && abs[0]!.demi_journee !== "JOURNEE"
                                      ? ` ${abs[0]!.demi_journee}`
                                      : ""}
                                  </span>
                                )}
                                {cell.length === 0 && abs.length === 0 ? (
                                  <span className="text-[11px] text-muted-foreground/40">—</span>
                                ) : (
                                  <ul className="space-y-0.5">
                                    {cell.map((c) => (
                                      <CellChantier
                                        key={c.id}
                                        affectation={c}
                                        affaire={affaireById.get(c.affaire_id)}
                                      />
                                    ))}
                                  </ul>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && ecarts.length > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Écart avec l'effectif prévu</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Effectif attendu (planning atelier) comparé aux personnes nommées, sur la période
            affichée.
          </p>
          <ul className="space-y-1 text-sm">
            {ecarts.map((e) => (
              <li key={e.metier_id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{e.libelle} :</span>
                <span className="text-muted-foreground">
                  {formatJoursPersonne(e.prevues)} personnes-jours prévues,{" "}
                  {formatJoursPersonne(e.nommees)} nommées
                </span>
                {e.aPourvoir > 0 ? (
                  <span className="font-medium text-amber-600">
                    — {formatJoursPersonne(e.aPourvoir)} à pourvoir
                  </span>
                ) : (
                  <span className="text-emerald-600">— complet</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CellChantier({
  affectation,
  affaire,
}: {
  affectation: QuiAffectation;
  affaire: QuiAffaire | undefined;
}) {
  return (
    <li className="flex items-start gap-1">
      <span
        aria-hidden
        className="mt-0.5 h-3 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: affaireColor(affectation.affaire_id) }}
      />
      <Link
        to="/affaires/$affaireId/planning-atelier"
        params={{ affaireId: affectation.affaire_id }}
        title={affaire ? `${affaire.numero} — ${affaire.nom} · Planifier` : "Planifier"}
        className="truncate text-[11px] hover:underline"
      >
        {affaireShortLabel(affaire)}
        {affectation.demi_journee !== "JOURNEE" && (
          <span className="ml-1 text-muted-foreground">{affectation.demi_journee}</span>
        )}
      </Link>
    </li>
  );
}
