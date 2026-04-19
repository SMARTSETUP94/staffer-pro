import { Fragment as FragmentGroup, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, CalendarOff, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type {
  Absence,
  Affaire,
  Assignation,
  DevisConsommation,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";
import { AssignationCell, type DragGroupPayload } from "./AssignationCell";
import { AssignationDialog } from "./AssignationDialog";
import { BulkAssignDialog } from "./BulkAssignDialog";
import { ABSENCE_ICON, ABSENCE_LABEL, findAbsence } from "@/lib/absence-helpers";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  weekStart: Date;
  employes: Employe[];
  metiers: Metier[];
  affaires: Affaire[];
  assignations: Assignation[];
  consommation: DevisConsommation[];
  absences: Absence[];
  filterAffaireIds?: Set<string>;
  filterMetierIds?: Set<number>;
  showWeekend?: boolean;
  emptyMessage: string;
  onChanged?: () => void;
  readonly?: boolean;
}

interface CellKey {
  employeId: string;
  date: string;
}

function cellKeyStr(c: CellKey) {
  return `${c.employeId}::${c.date}`;
}

export function PlanningGrid({
  weekStart,
  employes,
  metiers,
  affaires,
  assignations,
  consommation,
  absences,
  filterAffaireIds,
  filterMetierIds,
  showWeekend = false,
  emptyMessage,
  onChanged,
  readonly,
}: Props) {
  const days = useMemo(
    () => Array.from({ length: showWeekend ? 7 : 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime(), showWeekend],
  );

  const metiersById = useMemo(() => new Map(metiers.map((m) => [m.id, m])), [metiers]);
  const affairesById = useMemo(() => new Map(affaires.map((a) => [a.id, a])), [affaires]);

  const assignedEmployeIds = useMemo(
    () => new Set(assignations.map((a) => a.employe_id)),
    [assignations],
  );

  const filteredAssignations = useMemo(() => {
    return assignations.filter((a) => {
      if (filterAffaireIds && filterAffaireIds.size > 0 && !filterAffaireIds.has(a.affaire_id)) return false;
      if (filterMetierIds && filterMetierIds.size > 0 && !filterMetierIds.has(a.metier_id)) return false;
      return true;
    });
  }, [assignations, filterAffaireIds, filterMetierIds]);

  // Index conflits : (employe_id, date) -> détecte si plusieurs affaires DIFFÉRENTES
  // ou si chevauche une absence.
  const conflictsByCell = useMemo(() => {
    const map = new Map<string, { reason: "double_affaire" | "absence_overlap"; detail: string }>();
    // Conflits assignations : grouper par (emp,date)
    const grp = new Map<string, Assignation[]>();
    assignations.forEach((a) => {
      const k = `${a.employe_id}::${a.date}`;
      const arr = grp.get(k) ?? [];
      arr.push(a);
      grp.set(k, arr);
    });
    grp.forEach((items, key) => {
      const distinctAffaires = new Set(items.map((i) => i.affaire_id));
      if (distinctAffaires.size > 1) {
        // Double assignation sur affaires différentes
        const slotsParAffaire = new Map<string, Set<string>>();
        items.forEach((i) => {
          const set = slotsParAffaire.get(i.affaire_id) ?? new Set();
          set.add(i.demi_journee);
          slotsParAffaire.set(i.affaire_id, set);
        });
        // Vérif vrai conflit : 2 affaires demandent le même slot OU une JOURNEE
        // Un cas valide = affaire A en AM, affaire B en PM (pas de conflit)
        let hasConflict = false;
        const affaireSlots: { affaire: string; slots: Set<string> }[] = [];
        slotsParAffaire.forEach((slots, affaireId) => {
          affaireSlots.push({ affaire: affaireId, slots });
        });
        for (let i = 0; i < affaireSlots.length; i++) {
          for (let j = i + 1; j < affaireSlots.length; j++) {
            const a = affaireSlots[i].slots;
            const b = affaireSlots[j].slots;
            if (a.has("JOURNEE") || b.has("JOURNEE")) {
              hasConflict = true;
              break;
            }
            // intersection non vide ?
            for (const s of a) if (b.has(s)) { hasConflict = true; break; }
            if (hasConflict) break;
          }
          if (hasConflict) break;
        }
        if (hasConflict) {
          const numeros = Array.from(distinctAffaires)
            .map((id) => affairesById.get(id)?.numero ?? id)
            .join(", ");
          map.set(key, { reason: "double_affaire", detail: `Affecté sur ${distinctAffaires.size} affaires : ${numeros}` });
        }
      }
    });
    // Conflits absence : assignation existante sur jour absent
    assignations.forEach((a) => {
      const abs = findAbsence(absences, a.employe_id, a.date, a.demi_journee as "AM" | "PM" | "JOURNEE");
      if (abs && abs.valide) {
        const key = `${a.employe_id}::${a.date}`;
        const existing = map.get(key);
        const detail = `Assignation alors qu'absence (${ABSENCE_LABEL[abs.type]})`;
        if (!existing) map.set(key, { reason: "absence_overlap", detail });
      }
    });
    return map;
  }, [assignations, absences, affairesById]);

  const grouped = useMemo(() => {
    const groups = new Map<number, Employe[]>();
    employes.forEach((e) => {
      const arr = groups.get(e.metier_principal_id) ?? [];
      arr.push(e);
      groups.set(e.metier_principal_id, arr);
    });
    return metiers
      .filter((m) => groups.has(m.id))
      .map((m) => ({ metier: m, employes: groups.get(m.id) ?? [] }));
  }, [employes, metiers]);

  // Modale édition cellule simple
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    employe: Employe | null;
    date: Date | null;
  }>({ open: false, employe: null, date: null });

  // Multi-sélection Ctrl/Cmd+click
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const dialogExisting = useMemo(() => {
    if (!dialogState.employe || !dialogState.date) return [];
    const dayStr = format(dialogState.date, "yyyy-MM-dd");
    return assignations.filter(
      (a) => a.employe_id === dialogState.employe!.id && a.date === dayStr,
    );
  }, [assignations, dialogState.employe, dialogState.date]);

  function handleCellClick(emp: Employe, d: Date, ev: React.MouseEvent) {
    if (readonly) return;
    const dayStr = format(d, "yyyy-MM-dd");
    const key = cellKeyStr({ employeId: emp.id, date: dayStr });

    // Ctrl/Cmd-click → toggle dans la sélection multiple
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    // Click simple → si une sélection est active, on l'ignore pas mais on ouvre quand même
    setDialogState({ open: true, employe: emp, date: d });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function selectedCells(): { employeId: string; date: string }[] {
    return Array.from(selected).map((k) => {
      const [employeId, date] = k.split("::");
      return { employeId, date };
    });
  }

  // ─── Drag & Drop ─────────────────────────────────────────────────────────
  // distance:6 → distingue clic vs drag pour ne pas casser l'ouverture du dialog
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function slotsConflict(existing: Set<string>, incoming: "AM" | "PM" | "JOURNEE"): boolean {
    if (existing.size === 0) return false;
    if (existing.has("JOURNEE")) return true;
    if (incoming === "JOURNEE") return true;
    return existing.has(incoming);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const payload = active.data.current as DragGroupPayload | undefined;
    if (!payload || payload.type !== "assignation-group") return;

    const overId = String(over.id);
    if (!overId.startsWith("cell::")) return;
    const [, toEmployeId, toDate] = overId.split("::");

    const altPressed = (event.activatorEvent as MouseEvent | undefined)?.altKey === true;

    const sameCell = toEmployeId === payload.fromEmployeId && toDate === payload.fromDate;
    if (sameCell && !altPressed) return;

    // Cellule cible : occupée ?
    const targetExisting = assignations.filter(
      (a) => a.employe_id === toEmployeId && a.date === toDate,
    );
    // En déplacement, on ignore les rangs qu'on s'apprête à bouger
    const targetSlots = new Set(
      targetExisting
        .filter((a) => altPressed || !payload.assignationIds.includes(a.id))
        .map((a) => a.demi_journee as string),
    );
    if (slotsConflict(targetSlots, payload.slot)) {
      toast.error("Cellule occupée — impossible de déposer ici");
      return;
    }

    // Vérif absence sur la cellule cible
    const abs = findAbsence(absences, toEmployeId, toDate, payload.slot);
    if (abs && abs.valide) {
      toast.error(`Cellule en absence (${ABSENCE_LABEL[abs.type]}) — drop refusé`);
      return;
    }

    try {
      if (altPressed) {
        // Duplication : INSERT clones (champs essentiels uniquement)
        const sourceRows = assignations.filter((a) => payload.assignationIds.includes(a.id));
        const inserts = sourceRows.map((a) => ({
          affaire_id: a.affaire_id,
          employe_id: toEmployeId,
          metier_id: a.metier_id,
          date: toDate,
          demi_journee: a.demi_journee,
          heures: a.heures,
          notes: a.notes,
        }));
        const { error } = await supabase.from("assignations").insert(inserts);
        if (error) throw error;
        toast.success(`Assignation dupliquée (${inserts.length})`);
      } else {
        // Déplacement : UPDATE date + employe_id
        const { error } = await supabase
          .from("assignations")
          .update({ employe_id: toEmployeId, date: toDate })
          .in("id", payload.assignationIds);
        if (error) throw error;
        toast.success("Assignation déplacée");
      }
      onChanged?.();
    } catch (e) {
      console.error(e);
      toast.error("Échec de l'opération");
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (employes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <TooltipProvider delayDuration={200}>
      {/* Hint multi-sélection (toujours visible en haut, discret) */}
      {!readonly && selected.size === 0 && (
        <div data-export-ignore="true" className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            {typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac")
              ? "⌘"
              : "Ctrl"}
          </kbd>
          <span>+ clic sur plusieurs cellules vides pour assigner un même chantier en groupe.</span>
        </div>
      )}

      {/* Barre flottante sélection multiple */}
      {selected.size > 0 && !readonly && (
        <div data-export-ignore="true" className="sticky top-16 z-30 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-primary bg-primary/10 px-3 py-2 shadow-md backdrop-blur">
          <span className="text-sm font-semibold">
            {selected.size} cellule{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="mr-1 h-3.5 w-3.5" /> Annuler
            </Button>
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              Assigner les {selected.size} cellules
            </Button>
          </div>
        </div>
      )}

      <div data-planning-grid-export className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="sticky left-0 z-10 w-[200px] border-b bg-muted/50 p-2 text-left font-semibold">
                Employé
              </th>
              {days.map((d) => (
                <th key={d.toISOString()} className="border-b border-l p-2 text-center font-semibold">
                  <div className="text-[11px] uppercase">{format(d, "EEE", { locale: fr })}</div>
                  <div className="text-[10px] font-normal text-muted-foreground">{format(d, "dd/MM")}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ metier, employes: emps }) => (
              <FragmentGroup key={metier.id}>
                <tr>
                  <td
                    colSpan={days.length + 1}
                    className="border-b border-t bg-muted/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: metier.couleur }}
                  >
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: metier.couleur }}
                    />
                    {metier.libelle} ({emps.length})
                  </td>
                </tr>
                {emps.map((emp) => (
                  <tr key={emp.id} className="hover:bg-muted/30">
                    <td className="sticky left-0 z-10 border-b bg-card p-2 hover:bg-muted/30">
                      <div className="flex items-center gap-1.5">
                        {(emp.type_contrat === "CDI" || emp.type_contrat === "CDD") &&
                          !assignedEmployeIds.has(emp.id) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                                  aria-label="Disponible cette semaine"
                                />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">
                                Disponible cette semaine
                              </TooltipContent>
                            </Tooltip>
                          )}
                        <span
                          className="truncate font-semibold"
                          title={`${emp.prenom} ${emp.nom}`}
                        >
                          {emp.prenom} {emp.nom}
                        </span>
                      </div>
                      {emp.type_contrat !== "CDI" && (
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {emp.sous_type_contrat || emp.type_contrat}
                          {emp.agence_interim && ` · ${emp.agence_interim}`}
                        </div>
                      )}
                    </td>
                    {days.map((d) => {
                      const dayStr = format(d, "yyyy-MM-dd");
                      const key = cellKeyStr({ employeId: emp.id, date: dayStr });
                      const dayAssigns = filteredAssignations.filter(
                        (a) => a.employe_id === emp.id && a.date === dayStr,
                      );
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const absence = findAbsence(absences, emp.id, dayStr, "JOURNEE");
                      const conflict = conflictsByCell.get(key);
                      const isSelected = selected.has(key);

                      // Cellule absence : grisée et NON cliquable pour création
                      // (mais on peut quand même cliquer pour voir les assignations existantes)
                      if (absence && dayAssigns.length === 0) {
                        return (
                          <td
                            key={d.toISOString()}
                            className={cn(
                              "border-b border-l bg-muted/40 align-top",
                              isWeekend && "bg-muted/50",
                            )}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex h-full min-h-[44px] cursor-not-allowed items-center justify-center gap-1 p-1 text-center text-[11px] font-medium text-muted-foreground">
                                  <span className="text-base">{ABSENCE_ICON[absence.type]}</span>
                                  <span className="truncate">{ABSENCE_LABEL[absence.type]}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <div className="font-semibold">
                                  {ABSENCE_ICON[absence.type]} {ABSENCE_LABEL[absence.type]}
                                </div>
                                {absence.demi_journee && (
                                  <div className="text-muted-foreground">{absence.demi_journee}</div>
                                )}
                                {absence.motif && <div className="italic">{absence.motif}</div>}
                                {!absence.valide && (
                                  <div className="text-warning">⚠ Non validée</div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      }

                      return (
                        <DroppableCell
                          key={d.toISOString()}
                          employeId={emp.id}
                          date={dayStr}
                          className={cn(
                            "relative border-b border-l align-top",
                            isWeekend && "bg-muted/20",
                            !readonly && "cursor-pointer transition-colors hover:bg-primary/5",
                            isSelected && "bg-primary/15 ring-2 ring-inset ring-primary",
                            conflict && "ring-2 ring-inset ring-destructive",
                          )}
                          onClick={(e) => handleCellClick(emp, d, e)}
                          title={
                            readonly
                              ? undefined
                              : conflict
                                ? `⚠ Conflit : ${conflict.detail}`
                                : "Cliquer pour éditer · Ctrl+click pour sélection multiple · Glisser-déposer pour bouger (Alt = dupliquer)"
                          }
                        >
                          {conflict && (
                            <div className="absolute right-0.5 top-0.5 z-10">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow">
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <div className="font-semibold text-destructive">⚠ Conflit staffing</div>
                                  <div>{conflict.detail}</div>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                          <AssignationCell
                            assignations={dayAssigns}
                            metiersById={metiersById}
                            affairesById={affairesById}
                            dnd={readonly ? undefined : { employeId: emp.id, date: dayStr }}
                          />
                        </DroppableCell>
                      );
                    })}
                  </tr>
                ))}
              </FragmentGroup>
            ))}
          </tbody>
        </table>
      </div>

      {dialogState.employe && dialogState.date && (
        <AssignationDialog
          open={dialogState.open}
          onOpenChange={(o) => setDialogState((s) => ({ ...s, open: o }))}
          employe={dialogState.employe}
          date={dialogState.date}
          existing={dialogExisting}
          affaires={affaires}
          metiers={metiers}
          consommation={consommation}
          onSaved={() => onChanged?.()}
        />
      )}

      <BulkAssignDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        cells={selectedCells()}
        employes={employes}
        affaires={affaires}
        metiers={metiers}
        onSaved={() => {
          clearSelection();
          onChanged?.();
        }}
      />
    </TooltipProvider>
    </DndContext>
  );
}

interface DroppableCellProps {
  employeId: string;
  date: string;
  children: React.ReactNode;
  className?: string;
  onClick: (e: React.MouseEvent) => void;
  title?: string;
}

function DroppableCell({ employeId, date, children, className, onClick, title }: DroppableCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell::${employeId}::${date}`,
  });
  return (
    <td
      ref={setNodeRef}
      className={cn(className, isOver && "bg-primary/20 ring-2 ring-inset ring-primary/60")}
      onClick={onClick}
      title={title}
    >
      {children}
    </td>
  );
}
