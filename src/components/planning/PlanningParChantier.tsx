import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Briefcase, Lock, MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isAffaireSelectable, affaireLockReason } from "@/lib/affaire-lock";
import {
  TYPO_CELL_TINT_CLASSES,
  TYPO_COLOR_CLASSES,
  typologieColorFromNumero,
} from "@/lib/planning-typologie-colors";
import { AssignationDialog } from "./AssignationDialog";
import { ParChantierAssignDialog } from "./ParChantierAssignDialog";
import type {
  Affaire,
  Assignation,
  DevisConsommation,
  DevisLot,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";

interface Props {
  weekStart: Date;
  affaires: Affaire[];
  employes: Employe[];
  metiers: Metier[];
  assignations: Assignation[];
  consommation: DevisConsommation[];
  /** v0.21 Bloc 6 — lots devis pour pré-remplissage modale d'affectation. */
  devisLots?: DevisLot[];
  showWeekend?: boolean;
  filterAffaireIds?: Set<string>;
  filterMetierIds?: Set<number>;
  onSelectAffaire?: (affaireId: string) => void;
  /** v0.21 Bloc 6 — callback rafraîchissement après création/édition d'assignations. */
  onChanged?: () => void;
}

/** Vue planning pivotée : lignes = chantiers actifs cette semaine, colonnes = jours,
 *  cellules = chips employés affectés ce jour-là sur ce chantier. */
export function PlanningParChantier({
  weekStart,
  affaires,
  employes,
  metiers,
  assignations,
  consommation,
  devisLots = [],
  showWeekend = false,
  filterAffaireIds,
  filterMetierIds,
  onSelectAffaire,
  onChanged,
}: Props) {
  const days = useMemo(
    () => Array.from({ length: showWeekend ? 7 : 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime(), showWeekend],
  );

  const employesById = useMemo(
    () => new Map(employes.map((e) => [e.id, e])),
    [employes],
  );
  const metiersById = useMemo(
    () => new Map(metiers.map((m) => [m.id, m])),
    [metiers],
  );

  // v0.21 Bloc 6 — Édition directe : sélection multi-cellules par ligne (affaire)
  // Une cellule = "{affaireId}::{date}". Sélection limitée à une seule ligne à la fois.
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [selectionAffaireId, setSelectionAffaireId] = useState<string | null>(null);

  // États modales
  const [assignDlg, setAssignDlg] = useState<{
    affaire: Affaire;
    dates: string[];
  } | null>(null);
  const [editDlg, setEditDlg] = useState<{
    employe: Employe;
    date: Date;
    existing: Assignation[];
  } | null>(null);

  // Affaires actives = celles avec assignations dans la semaine OU heures budgétées
  const affairesActives = useMemo(() => {
    const ids = new Set<string>();
    assignations.forEach((a) => ids.add(a.affaire_id));
    consommation.forEach((c) => ids.add(c.affaire_id));
    let list = affaires.filter((a) => ids.has(a.id));
    if (filterAffaireIds && filterAffaireIds.size > 0) {
      list = list.filter((a) => filterAffaireIds.has(a.id));
    }
    return list.sort((a, b) => a.numero.localeCompare(b.numero));
  }, [affaires, assignations, consommation, filterAffaireIds]);

  // Index des assignations par (affaire_id, date)
  const assignByCell = useMemo(() => {
    const map = new Map<string, Assignation[]>();
    assignations.forEach((a) => {
      if (filterMetierIds && filterMetierIds.size > 0 && !filterMetierIds.has(a.metier_id)) {
        return;
      }
      const k = `${a.affaire_id}::${a.date}`;
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    });
    return map;
  }, [assignations, filterMetierIds]);

  // Total personnes uniques par affaire sur la semaine
  const totalPersonnesByAffaire = useMemo(() => {
    const map = new Map<string, number>();
    affairesActives.forEach((af) => {
      const set = new Set<string>();
      days.forEach((d) => {
        const dayStr = format(d, "yyyy-MM-dd");
        const arr = assignByCell.get(`${af.id}::${dayStr}`) ?? [];
        arr.forEach((a) => set.add(a.employe_id));
      });
      map.set(af.id, set.size);
    });
    return map;
  }, [affairesActives, assignByCell, days]);

  function handleCellClick(
    e: React.MouseEvent,
    affaire: Affaire,
    dayStr: string,
    cellAssigns: Assignation[],
  ) {
    e.stopPropagation();
    const isLocked = !isAffaireSelectable(affaire);

    // Cellule occupée → édition de la première assignation (comportement actuel préservé)
    if (cellAssigns.length > 0 && !e.ctrlKey && !e.metaKey) {
      const first = cellAssigns[0];
      const emp = employesById.get(first.employe_id);
      if (!emp) return;
      // Toutes les assignations de cet employé ce jour-là
      const empExisting = assignations.filter(
        (a) => a.employe_id === emp.id && a.date === first.date,
      );
      setEditDlg({ employe: emp, date: new Date(first.date), existing: empExisting });
      return;
    }

    // Cellule vide
    if (isLocked) return;

    // Ctrl+clic / Cmd+clic = multi-sélection sur la même ligne
    if (e.ctrlKey || e.metaKey) {
      const key = `${affaire.id}::${dayStr}`;
      setSelectedCells((prev) => {
        // Reset si on change de ligne
        if (selectionAffaireId && selectionAffaireId !== affaire.id) {
          setSelectionAffaireId(affaire.id);
          return new Set([key]);
        }
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        if (next.size === 0) {
          setSelectionAffaireId(null);
        } else if (!selectionAffaireId) {
          setSelectionAffaireId(affaire.id);
        }
        return next;
      });
      return;
    }

    // Clic simple sur cellule vide → modale d'affectation 1 jour
    setAssignDlg({ affaire, dates: [dayStr] });
  }

  function openMultiSelection() {
    if (!selectionAffaireId || selectedCells.size === 0) return;
    const affaire = affaires.find((a) => a.id === selectionAffaireId);
    if (!affaire) return;
    const dates = Array.from(selectedCells)
      .map((k) => k.split("::")[1])
      .sort();
    setAssignDlg({ affaire, dates });
    setSelectedCells(new Set());
    setSelectionAffaireId(null);
  }

  function clearSelection() {
    setSelectedCells(new Set());
    setSelectionAffaireId(null);
  }

  if (affairesActives.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Aucun chantier actif cette semaine.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="sticky left-0 z-10 w-[260px] border-b bg-muted/50 p-2 text-left font-semibold">
                Chantier
              </th>
              {days.map((d) => (
                <th
                  key={d.toISOString()}
                  className="border-b border-l p-2 text-center font-semibold"
                >
                  <div className="text-[11px] uppercase">
                    {format(d, "EEE", { locale: fr })}
                  </div>
                  <div className="text-[10px] font-normal text-muted-foreground">
                    {format(d, "dd/MM")}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {affairesActives.map((af) => {
              const totalPers = totalPersonnesByAffaire.get(af.id) ?? 0;
              const isLocked = !isAffaireSelectable(af);
              const lockMsg = affaireLockReason(af);
              return (
                <tr key={af.id} className="hover:bg-muted/30">
                  <td className="sticky left-0 z-10 border-b bg-card p-2 align-top hover:bg-muted/30">
                    <button
                      type="button"
                      className={cn(
                        "block w-full text-left",
                        onSelectAffaire && "cursor-pointer",
                      )}
                      onClick={() => onSelectAffaire?.(af.id)}
                      title={
                        onSelectAffaire
                          ? "Filtrer le planning par cette affaire"
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
                            TYPO_COLOR_CLASSES[typologieColorFromNumero(af.numero)]
                              .split(" ")
                              .filter((c) => c.startsWith("bg-") || c.startsWith("text-") || c.startsWith("dark:"))
                              .join(" "),
                          )}
                        >
                          {af.numero}
                        </span>
                        {isLocked && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>{lockMsg ?? "Affaire verrouillée"}</TooltipContent>
                          </Tooltip>
                        )}
                        <span
                          className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                          title={`${totalPers} personne${totalPers > 1 ? "s" : ""} sur la semaine`}
                        >
                          <Users className="h-2.5 w-2.5" /> {totalPers}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs font-semibold leading-tight">
                        {af.nom}
                      </div>
                      {(af.client || af.lieu) && (
                        <div className="mt-0.5 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                          {af.client && (
                            <div className="flex items-center gap-1 truncate">
                              <Briefcase className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{af.client}</span>
                            </div>
                          )}
                          {af.lieu && (
                            <div className="flex items-center gap-1 truncate">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{af.lieu}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  </td>
                  {days.map((d) => {
                    const dayStr = format(d, "yyyy-MM-dd");
                    const cellAssigns = assignByCell.get(`${af.id}::${dayStr}`) ?? [];
                    const cellKey = `${af.id}::${dayStr}`;
                    const isSelected = selectedCells.has(cellKey);
                    const isSelectableForMulti = selectionAffaireId === null || selectionAffaireId === af.id;
                    // Group par employé pour fusionner AM/PM
                    const byEmploye = new Map<string, Assignation[]>();
                    cellAssigns.forEach((a) => {
                      const arr = byEmploye.get(a.employe_id) ?? [];
                      arr.push(a);
                      byEmploye.set(a.employe_id, arr);
                    });
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const isEmpty = byEmploye.size === 0;
                    const isOpportunite = af.numero?.startsWith("9") ?? false;
                    return (
                      <td
                        key={d.toISOString()}
                        data-opportunite={isOpportunite ? "true" : undefined}
                        onClick={(e) => handleCellClick(e, af, dayStr, cellAssigns)}
                        className={cn(
                          "border-b border-l align-top transition-colors",
                          isWeekend && "bg-muted/20",
                          // v0.48 — teinte ambrée subtile pour chantiers prototypes 9XXX
                          isOpportunite && "bg-amber-50/40 dark:bg-amber-950/20",
                          !isLocked && "cursor-pointer hover:bg-primary/5",
                          isLocked && "cursor-not-allowed opacity-60",
                          isSelected && "ring-4 ring-primary ring-inset bg-primary/10",
                          !isSelectableForMulti && selectedCells.size > 0 && "opacity-50",
                        )}
                        title={
                          isLocked
                            ? lockMsg ?? undefined
                            : isEmpty
                              ? "Cliquer pour staffer · Ctrl+clic pour multi-sélection"
                              : "Cliquer pour éditer"
                        }
                      >
                        <div className="flex flex-wrap gap-1 p-1 min-h-[36px]">
                          {Array.from(byEmploye.entries()).map(([empId, arr]) => {
                            const emp = employesById.get(empId);
                            if (!emp) return null;
                            const slots = new Set(arr.map((a) => a.demi_journee));
                            let slotLabel = "";
                            if (slots.has("JOURNEE") || (slots.has("AM") && slots.has("PM"))) {
                              slotLabel = "J";
                            } else if (slots.has("AM")) slotLabel = "AM";
                            else slotLabel = "PM";
                            const metier = metiersById.get(arr[0].metier_id);
                            const heures = arr.reduce(
                              (s, a) => s + Number(a.heures || 0),
                              0,
                            );
                            return (
                              <Tooltip key={empId}>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 rounded-full border bg-card px-1.5 py-0.5 text-[10px] font-medium shadow-sm hover:bg-muted">
                                    <span
                                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                                      style={{
                                        backgroundColor: metier?.couleur ?? "#94a3b8",
                                      }}
                                      aria-hidden
                                    />
                                    <span className="truncate max-w-[110px]">
                                      {emp.prenom} {emp.nom.charAt(0)}.
                                    </span>
                                    <span className="rounded bg-muted px-1 text-[9px] font-bold">
                                      {slotLabel}
                                    </span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="border bg-white p-2 text-xs text-gray-900 shadow-lg"
                                >
                                  <div className="font-semibold">
                                    {emp.prenom} {emp.nom}
                                  </div>
                                  <div className="text-gray-600">
                                    {metier?.libelle ?? "—"} · {heures}h ·{" "}
                                    {slotLabel === "J" ? "Journée" : slotLabel}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                          {isEmpty && !isLocked && (
                            <span className="text-[10px] text-muted-foreground/40 self-center mx-auto">+</span>
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

      {/* Barre flottante multi-sélection */}
      {selectedCells.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-full border bg-card px-4 py-2 shadow-lg">
          <span className="text-sm font-semibold">
            {selectedCells.size} cellule(s) sélectionnée(s)
          </span>
          <button
            type="button"
            onClick={openMultiSelection}
            className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Affecter ces {selectedCells.size} cellule(s)
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Modale d'affectation (création) */}
      {assignDlg && (
        <ParChantierAssignDialog
          open
          onOpenChange={(o) => !o && setAssignDlg(null)}
          affaire={assignDlg.affaire}
          dates={assignDlg.dates}
          employes={employes}
          metiers={metiers}
          devisLots={devisLots}
          assignations={assignations}
          onSaved={() => {
            onChanged?.();
            setAssignDlg(null);
          }}
        />
      )}

      {/* Modale d'édition d'assignation existante */}
      {editDlg && (
        <AssignationDialog
          open
          onOpenChange={(o) => !o && setEditDlg(null)}
          date={editDlg.date}
          employe={editDlg.employe}
          existing={editDlg.existing}
          affaires={affaires}
          metiers={metiers}
          consommation={consommation.map((c) => ({
            affaire_id: c.affaire_id,
            metier_id: c.metier_id,
            heures_prevues: c.heures_prevues,
            heures_assignees: c.heures_assignees,
            heures_restantes: c.heures_restantes,
          }))}
          devisLots={devisLots}
          onSaved={() => {
            onChanged?.();
            setEditDlg(null);
          }}
        />
      )}
    </TooltipProvider>
  );
}
