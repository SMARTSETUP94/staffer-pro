import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import { requireCapability } from "@/lib/capability-guard";
import { useCapability } from "@/hooks/use-capability";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { usePlanningAtelier } from "@/hooks/use-planning-atelier";
import { PoserPeriodeDialog } from "@/components/planning-atelier/PoserPeriodeDialog";
import { NommageSheet } from "@/components/planning-atelier/NommageSheet";
import { isJourFerieFR, isWeekend, labelJourFerieFR } from "@/lib/jours-feries";
import {
  addDaysISO, buildJourWindow, countNommesParPlan, expandCellRange, heuresPlanifiees,
  labelJourCourt, ligneStatut, nommageEtat, planKey, buildPlanIndex, rowKey, rowsOfLine,
  startOfWeekISO, toISO, type PlanRow,
} from "@/lib/planning-atelier";
import { cellKey, buildCellIndex } from "@/lib/grille-fabrication";

const feriesApi = { isWeekend, isFerie: isJourFerieFR, labelFerie: labelJourFerieFR };

const searchSchema = z.object({
  debut: z.string().optional(),
  semaines: z.coerce.number().min(1).max(12).optional(),
});
type PlanningSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_app/affaires/$affaireId/planning-atelier")({
  beforeLoad: () => requireCapability("section.fabrication"),
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Planning atelier — Setup Paris" }] }),
  component: PlanningAtelierPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Affaire introuvable.</div>,
});

interface Ligne {
  key: string;
  kind: "lot" | "objet";
  ownerId: string;
  objetId: string | null;
  lotId: string | null;
  label: string;
  metierId: number;
  metierLibelle: string;
  metierCouleur: string | null;
  heuresPrevues: number;
  /** Objets à rattacher dans `assignation_objets` lors du nommage. */
  objetIds: string[];
  indent: boolean;
}

function PlanningAtelierPage() {
  const { affaireId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const canEdit = useCapability("casting.edit_phase_fabrication");

  const debut = search.debut ?? startOfWeekISO(toISO(new Date()));
  const semaines = search.semaines ?? 4;
  const nbJours = semaines * 7;
  const fin = addDaysISO(debut, nbJours - 1);

  const { query, setPers, poserPeriode, nommer, denommer } = usePlanningAtelier(affaireId, debut, fin);

  const [collapsedLots, setCollapsedLots] = useState<string[]>([]);
  const [openPeriode, setOpenPeriode] = useState(false);
  const [nommagePlan, setNommagePlan] = useState<{ plan: PlanRow; ligne: Ligne } | null>(null);
  const [drag, setDrag] = useState<{ row: string; date: string } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ row: string; date: string } | null>(null);

  const jours = useMemo(() => buildJourWindow(debut, nbJours, feriesApi), [debut, nbJours]);
  const data = query.data;

  const setSearch = (patch: Partial<PlanningSearch>) =>
    void navigate({ to: ".", search: (p: PlanningSearch) => ({ ...p, ...patch }) });

  const lignes = useMemo<Ligne[]>(() => {
    if (!data) return [];
    const cellIndex = buildCellIndex(data.cells);
    const metierById = new Map(data.metiers.map((m) => [m.id, m]));
    const out: Ligne[] = [];

    const objetsDuLot = (lotId: string) => data.objets.filter((o) => o.lot_id === lotId);

    const pushObjetLignes = (
      objet: { id: string; reference: string; nom: string },
      indent: boolean,
    ) => {
      for (const m of data.metiers) {
        const cell = cellIndex.get(cellKey(objet.id, m.id));
        if (!cell || cell.heures_prevues <= 0) continue;
        out.push({
          key: rowKey({ objetId: objet.id }, m.id),
          kind: "objet",
          ownerId: objet.id,
          objetId: objet.id,
          lotId: null,
          label: `${objet.reference ? `${objet.reference} — ` : ""}${objet.nom}`,
          metierId: m.id,
          metierLibelle: m.libelle,
          metierCouleur: m.couleur,
          heuresPrevues: cell.heures_prevues,
          objetIds: [objet.id],
          indent,
        });
      }
    };

    for (const lot of data.lots) {
      const membres = objetsDuLot(lot.id);
      if (membres.length === 0) continue;
      const metiersDuLot = new Set<number>();
      let heuresLot = 0;
      for (const o of membres) {
        for (const m of data.metiers) {
          const c = cellIndex.get(cellKey(o.id, m.id));
          if (c && c.heures_prevues > 0) {
            metiersDuLot.add(m.id);
            heuresLot += c.heures_prevues;
          }
        }
      }
      for (const metierId of [...metiersDuLot].sort((a, b) => a - b)) {
        const m = metierById.get(metierId);
        if (!m) continue;
        const heures = membres.reduce(
          (acc, o) => acc + (cellIndex.get(cellKey(o.id, metierId))?.heures_prevues ?? 0),
          0,
        );
        out.push({
          key: rowKey({ lotId: lot.id }, metierId),
          kind: "lot",
          ownerId: lot.id,
          objetId: null,
          lotId: lot.id,
          label: `Lot ${lot.nom}`,
          metierId,
          metierLibelle: m.libelle,
          metierCouleur: m.couleur,
          heuresPrevues: heures,
          objetIds: membres.map((o) => o.id),
          indent: false,
        });
      }
      if (!collapsedLots.includes(lot.id)) {
        for (const o of membres) pushObjetLignes(o, true);
      }
      void heuresLot;
    }

    for (const o of data.objets.filter((x) => !x.lot_id)) pushObjetLignes(o, false);
    return out;
  }, [data, collapsedLots]);

  const planIndex = useMemo(() => buildPlanIndex(data?.plans ?? []), [data?.plans]);
  const nommesParPlan = useMemo(() => countNommesParPlan(data?.nommages ?? []), [data?.nommages]);
  const rowOrder = useMemo(() => lignes.map((l) => l.key), [lignes]);
  const dateOrder = useMemo(() => jours.map((j) => j.date), [jours]);

  const selection = useMemo(() => {
    if (!drag || !dragEnd) return new Set<string>();
    return new Set(
      expandCellRange(drag, dragEnd, rowOrder, dateOrder).map((c) => `${c.row}|${c.date}`),
    );
  }, [drag, dragEnd, rowOrder, dateOrder]);

  const write = (ligne: Ligne, date: string, nb: number) => {
    const existing = planIndex.get(planKey({ objetId: ligne.objetId, lotId: ligne.lotId }, ligne.metierId, date)) ?? null;
    setPers.mutate(
      {
        existing,
        objet_id: ligne.objetId,
        lot_id: ligne.lotId,
        metier_id: ligne.metierId,
        date,
        nb_pers: nb,
      },
      { onError: () => toast.error("Modification impossible") },
    );
  };

  const applySelection = (nb: number) => {
    if (!drag || !dragEnd) return;
    const cells = expandCellRange(drag, dragEnd, rowOrder, dateOrder);
    const byKey = new Map(lignes.map((l) => [l.key, l]));
    for (const c of cells) {
      const ligne = byKey.get(c.row);
      if (ligne) write(ligne, c.date, nb);
    }
    setDrag(null);
    setDragEnd(null);
  };

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (lignes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Aucun objet à planifier. Renseignez d'abord les heures dans l'onglet Grille.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link to="/affaires/$affaireId/grille" params={{ affaireId }}>
            Ouvrir la grille
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Planning atelier</h2>
            <p className="text-sm text-muted-foreground">
              Effectif prévisionnel anonyme — le nommage des personnes est optionnel.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="icon" variant="outline" aria-label="Semaine précédente"
              onClick={() => setSearch({ debut: addDaysISO(debut, -7) })}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={debut}
              className="w-[150px]"
              onChange={(e) => e.target.value && setSearch({ debut: startOfWeekISO(e.target.value) })}
            />
            <Button size="icon" variant="outline" aria-label="Semaine suivante"
              onClick={() => setSearch({ debut: addDaysISO(debut, 7) })}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="flex rounded-md border p-0.5">
              {[2, 4, 8].map((n) => (
                <Button
                  key={n} size="sm"
                  variant={semaines === n ? "secondary" : "ghost"}
                  onClick={() => setSearch({ semaines: n })}
                >
                  {n} sem.
                </Button>
              ))}
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => setOpenPeriode(true)}>
                <CalendarPlus className="mr-1.5 h-4 w-4" /> Poser une période
              </Button>
            )}
          </div>
        </div>

        {selection.size > 0 && canEdit && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-accent/40 p-2 text-sm">
            <span>{selection.size} cellule{selection.size > 1 ? "s" : ""} sélectionnée{selection.size > 1 ? "s" : ""}</span>
            {[1, 2, 3, 4].map((n) => (
              <Button key={n} size="sm" variant="outline" onClick={() => applySelection(n)}>
                {n} pers.
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => applySelection(0)}>Vider</Button>
            <Button size="sm" variant="ghost" onClick={() => { setDrag(null); setDragEnd(null); }}>
              Annuler
            </Button>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border" onMouseLeave={() => setDragEnd(dragEnd)}>
          <table className="border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-20 min-w-[300px] bg-muted/40 p-2 text-left font-medium">
                  Objet / lot · métier
                </th>
                {jours.map((j) => (
                  <th
                    key={j.date}
                    className={cn(
                      "min-w-[46px] p-1 text-center text-[11px] font-medium",
                      (j.weekend || j.ferie) && "bg-muted text-muted-foreground",
                    )}
                    title={j.ferieLabel ?? undefined}
                  >
                    {labelJourCourt(j.date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => {
                const rows = rowsOfLine(
                  data?.plans ?? [],
                  { objetId: ligne.objetId, lotId: ligne.lotId },
                  ligne.metierId,
                );
                const planifiees = heuresPlanifiees(rows);
                const statut = ligneStatut(ligne.heuresPrevues, planifiees);
                const isLot = ligne.kind === "lot";
                return (
                  <tr key={ligne.key} className={cn("border-b", isLot && "bg-accent/30")}>
                    <td className={cn("sticky left-0 z-10 p-2", isLot ? "bg-accent/30" : "bg-background")}>
                      <div className={cn("flex items-center gap-2", ligne.indent && "pl-5")}>
                        {isLot && (
                          <button
                            type="button"
                            aria-label="Replier le lot"
                            onClick={() =>
                              setCollapsedLots((prev) =>
                                prev.includes(ligne.ownerId)
                                  ? prev.filter((x) => x !== ligne.ownerId)
                                  : [...prev, ligne.ownerId],
                              )
                            }
                          >
                            {collapsedLots.includes(ligne.ownerId)
                              ? <ChevronRight className="h-3.5 w-3.5" />
                              : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: ligne.metierCouleur ?? "hsl(var(--muted-foreground))" }}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className={cn("block truncate", isLot && "font-semibold")} title={ligne.label}>
                            {ligne.label}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {ligne.metierLibelle} · {planifiees} h planifiées / {ligne.heuresPrevues} h prévues
                          </span>
                        </span>
                        {statut === "depassement" && (
                          <Badge variant="destructive" className="text-[10px]">Dépassement</Badge>
                        )}
                        {statut === "non_planifie" && (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-500">
                            Non planifié
                          </Badge>
                        )}
                      </div>
                    </td>
                    {jours.map((j) => {
                      const plan = planIndex.get(
                        planKey({ objetId: ligne.objetId, lotId: ligne.lotId }, ligne.metierId, j.date),
                      );
                      const selected = selection.has(`${ligne.key}|${j.date}`);
                      const etat = plan
                        ? nommageEtat(plan.nb_pers, nommesParPlan[plan.id] ?? 0)
                        : "aucun";
                      return (
                        <td
                          key={j.date}
                          className={cn(
                            "border-l p-0 text-center align-middle",
                            (j.weekend || j.ferie) && "bg-muted/60",
                            selected && "ring-1 ring-inset ring-primary",
                          )}
                          onMouseDown={() => {
                            if (!canEdit) return;
                            setDrag({ row: ligne.key, date: j.date });
                            setDragEnd({ row: ligne.key, date: j.date });
                          }}
                          onMouseEnter={() => {
                            if (drag) setDragEnd({ row: ligne.key, date: j.date });
                          }}
                        >
                          <div className="relative flex h-9 items-center justify-center">
                            <PersCell
                              value={plan?.nb_pers ?? 0}
                              disabled={!canEdit}
                              onCommit={(nb) => write(ligne, j.date, nb)}
                            />
                            {plan && plan.nb_pers > 0 && (
                              <>
                                <span
                                  className={cn(
                                    "absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full",
                                    etat === "complet" ? "bg-emerald-500"
                                      : etat === "partiel" ? "bg-amber-500" : "bg-transparent",
                                  )}
                                  aria-hidden
                                />
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="absolute bottom-0 left-0.5 text-muted-foreground/50 hover:text-foreground"
                                      onClick={() => setNommagePlan({ plan, ligne })}
                                      aria-label="Nommer les personnes"
                                    >
                                      <Users className="h-3 w-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {nommesParPlan[plan.id] ?? 0} / {plan.nb_pers} nommée(s)
                                  </TooltipContent>
                                </Tooltip>
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <PoserPeriodeDialog
          open={openPeriode}
          onOpenChange={setOpenPeriode}
          objets={data?.objets ?? []}
          lots={data?.lots ?? []}
          metiers={data?.metiers ?? []}
          defaultDate={debut}
          saving={poserPeriode.isPending}
          onSubmit={(values) =>
            poserPeriode.mutate(values, {
              onSuccess: () => {
                setOpenPeriode(false);
                toast.success(`${values.dates.length} jour(s) posé(s)`);
              },
              onError: () => toast.error("Impossible de poser la période"),
            })
          }
        />

        <NommageSheet
          open={!!nommagePlan}
          onOpenChange={(o) => !o && setNommagePlan(null)}
          plan={nommagePlan?.plan ?? null}
          metierLibelle={nommagePlan?.ligne.metierLibelle ?? ""}
          ligneLabel={nommagePlan?.ligne.label ?? ""}
          nommages={(data?.nommages ?? []).filter(
            (n) => n.atelier_planning_id === nommagePlan?.plan.id,
          )}
          canEdit={canEdit}
          pending={nommer.isPending || denommer.isPending}
          onNommer={(employeId) => {
            if (!nommagePlan) return;
            nommer.mutate(
              { plan: nommagePlan.plan, employe_id: employeId, objetIds: nommagePlan.ligne.objetIds },
              { onError: () => toast.error("Nommage impossible") },
            );
          }}
          onRetirer={(id) =>
            denommer.mutate(id, { onError: () => toast.error("Retrait impossible") })
          }
        />
      </div>
    </TooltipProvider>
  );
}

/** Cellule d'effectif : chiffre simple éditable au clic. */
function PersCell({
  value, disabled, onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (nb: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        inputMode="numeric"
        className="h-8 w-11 rounded border bg-background text-center text-sm outline-none ring-1 ring-primary/40"
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={() => {
          setEditing(false);
          const nb = Number(draft) || 0;
          if (nb !== value) onCommit(nb);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onDoubleClick={() => {
        setDraft(value ? String(value) : "");
        setEditing(true);
      }}
      onClick={() => {
        if (disabled) return;
        setDraft(value ? String(value) : "");
        setEditing(true);
      }}
      className={cn(
        "h-8 w-11 rounded text-sm tabular-nums",
        value ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground/40",
        !disabled && "hover:bg-accent",
      )}
    >
      {value || "·"}
    </button>
  );
}
