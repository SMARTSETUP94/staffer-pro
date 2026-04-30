import { Fragment as FragmentWithKey, useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Loader2, Package, Plus, Search, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isAffaireSelectable, affaireLockReason } from "@/lib/affaire-lock";
import { supabase } from "@/integrations/supabase/client";
import { AssignationDialog } from "./AssignationDialog";
import { CellEditDialog } from "./CellEditDialog";
import type {
  Affaire,
  Assignation,
  DevisConsommation,
  DevisLot,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";
import { normalizeName } from "@/lib/string-normalize";
import { toast } from "sonner";

interface FabObjet {
  id: string;
  affaire_id: string;
  reference: string;
  nom: string;
  ordre: number;
  heures_prevues_total: number;
}

interface ObjetLink {
  assignation_id: string;
  objet_id: string;
}

interface Props {
  weekStart: Date;
  affaires: Affaire[];
  employes: Employe[];
  metiers: Metier[];
  assignations: Assignation[];
  consommation: DevisConsommation[];
  devisLots?: DevisLot[];
  showWeekend?: boolean;
  filterAffaireIds?: Set<string>;
  filterMetierIds?: Set<number>;
  onChanged?: () => void;
}

/** v0.26 — Vue planning par OBJET de fabrication.
 * Lignes = objets (groupés par affaire) ; colonnes = jours.
 * Cellule = chips employés rattachés à cet objet via assignation_objets.
 * Staffing : clic sur cellule vide → AssignationDialog pré-rempli (affaire + objet).
 * Drag & drop : depuis le panneau Employés à droite vers une cellule. */
export function PlanningParObjet({
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
  onChanged,
}: Props) {
  const days = useMemo(
    () => Array.from({ length: showWeekend ? 7 : 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime(), showWeekend],
  );

  const employesById = useMemo(() => new Map(employes.map((e) => [e.id, e])), [employes]);
  const metiersById = useMemo(() => new Map(metiers.map((m) => [m.id, m])), [metiers]);
  const affairesById = useMemo(() => new Map(affaires.map((a) => [a.id, a])), [affaires]);

  // Affaires retenues (filtre + actives sur la semaine)
  const affairesRetenues = useMemo(() => {
    const ids = new Set<string>();
    assignations.forEach((a) => ids.add(a.affaire_id));
    consommation.forEach((c) => ids.add(c.affaire_id));
    let list = affaires.filter((a) => ids.has(a.id));
    if (filterAffaireIds && filterAffaireIds.size > 0) {
      list = list.filter((a) => filterAffaireIds.has(a.id));
    }
    return list.sort((a, b) => a.numero.localeCompare(b.numero));
  }, [affaires, assignations, consommation, filterAffaireIds]);

  // Charge les objets non archivés des affaires retenues
  const [objets, setObjets] = useState<FabObjet[]>([]);
  const [loadingObjets, setLoadingObjets] = useState(false);

  useEffect(() => {
    const ids = affairesRetenues.map((a) => a.id);
    if (ids.length === 0) {
      setObjets([]);
      return;
    }
    let cancelled = false;
    setLoadingObjets(true);
    supabase
      .from("fabrication_objets")
      .select("id, affaire_id, reference, nom, ordre, created_at, heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention, quantite")
      .in("affaire_id", ids)
      .eq("archive", false)
      .order("affaire_id", { ascending: true })
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingObjets(false);
        if (error) {
          toast.error(`Erreur chargement objets : ${error.message}`);
          return;
        }
        setObjets(
          (data ?? []).map((o) => {
            const qte = Number(o.quantite ?? 1) || 1;
            const totalUnit =
              Number(o.heures_prevues_be ?? 0) +
              Number(o.heures_prevues_numerique ?? 0) +
              Number(o.heures_prevues_bois ?? 0) +
              Number(o.heures_prevues_metal ?? 0) +
              Number(o.heures_prevues_peinture ?? 0) +
              Number(o.heures_prevues_tapisserie ?? 0) +
              Number(o.heures_prevues_manutention ?? 0);
            return {
              id: o.id,
              affaire_id: o.affaire_id,
              reference: o.reference,
              nom: o.nom,
              ordre: o.ordre ?? 0,
              heures_prevues_total: totalUnit * qte,
            };
          }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [affairesRetenues]);

  // Charge les liens assignation_objets pour les assignations de la semaine
  const [links, setLinks] = useState<ObjetLink[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const assignIds = assignations.map((a) => a.id);
    if (assignIds.length === 0) {
      setLinks([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("assignation_objets")
      .select("assignation_id, objet_id")
      .in("assignation_id", assignIds)
      .then(({ data }) => {
        if (cancelled) return;
        setLinks(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [assignations, reloadKey]);

  function refreshLinks() {
    setReloadKey((k) => k + 1);
  }

  // Index des assignations par id pour résoudre les liens
  const assignById = useMemo(() => {
    const m = new Map<string, Assignation>();
    assignations.forEach((a) => m.set(a.id, a));
    return m;
  }, [assignations]);

  // Index : (objet_id, date) → Assignation[]
  const assignByObjetCell = useMemo(() => {
    const map = new Map<string, Assignation[]>();
    links.forEach((lk) => {
      const a = assignById.get(lk.assignation_id);
      if (!a) return;
      if (filterMetierIds && filterMetierIds.size > 0 && !filterMetierIds.has(a.metier_id)) {
        return;
      }
      const key = `${lk.objet_id}::${a.date}`;
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    });
    return map;
  }, [links, assignById, filterMetierIds]);

  // Index : objet_id → total heures assignées (toutes dates chargées, hors filtre métier)
  const heuresAssigneesByObjet = useMemo(() => {
    const map = new Map<string, number>();
    links.forEach((lk) => {
      const a = assignById.get(lk.assignation_id);
      if (!a) return;
      map.set(lk.objet_id, (map.get(lk.objet_id) ?? 0) + Number(a.heures || 0));
    });
    return map;
  }, [links, assignById]);

  // Filtre objets retenus (affaire visible + objet ayant au moins 1 assign si filterAffaire actif vide ?)
  const objetsByAffaire = useMemo(() => {
    const map = new Map<string, FabObjet[]>();
    objets.forEach((o) => {
      const arr = map.get(o.affaire_id) ?? [];
      arr.push(o);
      map.set(o.affaire_id, arr);
    });
    return map;
  }, [objets]);

  // Sidebar employés (recherche)
  const [searchEmp, setSearchEmp] = useState("");
  const employesFiltres = useMemo(() => {
    const q = normalizeName(searchEmp.trim());
    if (!q) return employes;
    return employes.filter((e) => normalizeName(`${e.prenom} ${e.nom}`).includes(q));
  }, [employes, searchEmp]);

  // Drag state
  const [dragEmp, setDragEmp] = useState<Employe | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Dialog création (drag & drop / picker cellule vide)
  const [assignDlg, setAssignDlg] = useState<{
    employe: Employe;
    date: Date;
    affaireId: string;
    objetId: string;
    existing: Assignation[];
  } | null>(null);

  // Dialog édition groupée d'une cellule (objet × jour)
  const [cellDlg, setCellDlg] = useState<{
    objet: FabObjet;
    affaire: Affaire;
    date: Date;
    cellAssigns: Assignation[];
  } | null>(null);

  function openCreateDialog(emp: Employe, affaire: Affaire, objet: FabObjet, day: Date) {
    if (!isAffaireSelectable(affaire)) {
      toast.error(affaireLockReason(affaire) ?? "Affaire verrouillée");
      return;
    }
    const dayStr = format(day, "yyyy-MM-dd");
    const empExisting = assignations.filter(
      (a) => a.employe_id === emp.id && a.date === dayStr,
    );
    setAssignDlg({
      employe: emp,
      date: day,
      affaireId: affaire.id,
      objetId: objet.id,
      existing: empExisting,
    });
  }

  function openEditDialog(a: Assignation) {
    const emp = employesById.get(a.employe_id);
    const aff = affairesById.get(a.affaire_id);
    if (!emp || !aff) return;
    const empExisting = assignations.filter(
      (x) => x.employe_id === emp.id && x.date === a.date,
    );
    setAssignDlg({
      employe: emp,
      date: new Date(a.date),
      affaireId: a.affaire_id,
      objetId: "",
      existing: empExisting,
    });
  }

  if (affairesRetenues.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Aucun chantier actif cette semaine. Ajuste les filtres pour voir des objets.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex gap-3">
        {/* Grille objets */}
        <div className="flex-1 overflow-x-auto rounded-lg border bg-card">
          {loadingObjets ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <table className="w-full min-w-[900px] border-collapse text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="sticky left-0 z-10 w-[280px] border-b bg-muted/50 p-2 text-left font-semibold">
                    Objet de fabrication
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
                {affairesRetenues.map((af) => {
                  const objs = objetsByAffaire.get(af.id) ?? [];
                  if (objs.length === 0) return null;
                  const isLocked = !isAffaireSelectable(af);
                  return (
                    <FragmentWithKey key={af.id}>
                      <tr className="bg-muted/30">
                        <td
                          colSpan={days.length + 1}
                          className="sticky left-0 z-10 border-b bg-muted/30 px-2 py-1.5 text-[11px]"
                        >
                          <span className="rounded bg-background px-1.5 py-0.5 font-mono font-bold">
                            {af.numero}
                          </span>
                          <span className="ml-2 font-semibold">{af.nom}</span>
                          <span className="ml-2 text-muted-foreground">
                            · {objs.length} objet{objs.length > 1 ? "s" : ""}
                          </span>
                        </td>
                      </tr>
                      {objs.map((obj) => {
                        const heuresAssign = heuresAssigneesByObjet.get(obj.id) ?? 0;
                        const heuresPrev = obj.heures_prevues_total;
                        const depassement = heuresAssign - heuresPrev;
                        const isOver = heuresPrev > 0 && depassement > 0;
                        const noBudget = heuresPrev === 0 && heuresAssign > 0;
                        return (
                        <tr key={obj.id} className="hover:bg-muted/20">
                          <td className="sticky left-0 z-10 border-b bg-card p-2 align-top">
                            <div className="flex items-start gap-1.5">
                              <Package className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[11px] font-bold">
                                    {obj.reference}
                                  </span>
                                  {isOver && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-destructive-foreground">
                                          <AlertTriangle className="h-2.5 w-2.5" />
                                          +{depassement}h
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="border bg-white p-2 text-xs text-gray-900 shadow-lg">
                                        <div className="font-semibold text-destructive">Dépassement détecté</div>
                                        <div className="text-gray-600">
                                          Assignées : {heuresAssign}h<br />
                                          Prévues devis : {heuresPrev}h<br />
                                          Écart : <span className="font-bold">+{depassement}h</span>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  {noBudget && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                          <AlertTriangle className="h-2.5 w-2.5" />
                                          Hors budget
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="border bg-white p-2 text-xs text-gray-900 shadow-lg">
                                        Aucune heure prévue dans le devis pour cet objet, mais {heuresAssign}h ont été assignées.
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                                <div className="truncate text-[11px] leading-tight text-muted-foreground">
                                  {obj.nom}
                                </div>
                                {heuresPrev > 0 && (
                                  <div className={cn(
                                    "mt-0.5 text-[10px] font-medium tabular-nums",
                                    isOver ? "text-destructive" : "text-muted-foreground",
                                  )}>
                                    {heuresAssign}h / {heuresPrev}h
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          {days.map((d) => {
                            const dayStr = format(d, "yyyy-MM-dd");
                            const cellKey = `${obj.id}::${dayStr}`;
                            const cellAssigns = assignByObjetCell.get(cellKey) ?? [];
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            const isEmpty = cellAssigns.length === 0;
                            const isDragOver = dragOverKey === cellKey;
                            const cellHeures = cellAssigns.reduce((s, a) => s + Number(a.heures || 0), 0);
                            const cellOver = (isOver || noBudget) && cellHeures > 0;

                            // Group par employé pour fusion
                            const byEmp = new Map<string, Assignation[]>();
                            cellAssigns.forEach((a) => {
                              const arr = byEmp.get(a.employe_id) ?? [];
                              arr.push(a);
                              byEmp.set(a.employe_id, arr);
                            });

                            return (
                              <td
                                key={d.toISOString()}
                                onDragOver={(e) => {
                                  if (!dragEmp || isLocked) return;
                                  e.preventDefault();
                                  setDragOverKey(cellKey);
                                }}
                                onDragLeave={() => {
                                  if (dragOverKey === cellKey) setDragOverKey(null);
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  setDragOverKey(null);
                                  if (!dragEmp || isLocked) return;
                                  openCreateDialog(dragEmp, af, obj, d);
                                  setDragEmp(null);
                                }}
                                onClick={() => {
                                  if (isEmpty) return; // cellule vide → utiliser le bouton "+" (Popover)
                                  // Cellule occupée : éditer la 1ère
                                  openEditDialog(cellAssigns[0]);
                                }}
                                className={cn(
                                  "border-b border-l align-top transition-colors",
                                  isWeekend && "bg-muted/20",
                                  isLocked && "cursor-not-allowed opacity-60",
                                  !isLocked && "cursor-pointer hover:bg-primary/5",
                                  isDragOver && "ring-2 ring-primary ring-inset bg-primary/10",
                                  cellOver && "bg-destructive/10 ring-1 ring-destructive/40 ring-inset",
                                )}
                              >
                                <div className="flex flex-wrap gap-1 p-1 min-h-[40px]">
                                  {Array.from(byEmp.entries()).map(([empId, arr]) => {
                                    const emp = employesById.get(empId);
                                    if (!emp) return null;
                                    const metier = metiersById.get(arr[0].metier_id);
                                    const heuresTotal = arr.reduce(
                                      (s, a) => s + Number(a.heures || 0),
                                      0,
                                    );
                                    return (
                                      <Tooltip key={empId}>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openEditDialog(arr[0]);
                                            }}
                                            className="inline-flex items-center gap-1 rounded-full border bg-card px-1.5 py-0.5 text-[10px] font-medium shadow-sm hover:bg-muted"
                                          >
                                            <span
                                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                                              style={{
                                                backgroundColor: metier?.couleur ?? "#94a3b8",
                                              }}
                                            />
                                            <span className="truncate max-w-[100px]">
                                              {emp.prenom} {emp.nom.charAt(0)}.
                                            </span>
                                            <span className="rounded bg-muted px-1 text-[9px] font-bold">
                                              {heuresTotal}h
                                            </span>
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="top"
                                          className="border bg-white p-2 text-xs text-gray-900 shadow-lg"
                                        >
                                          <div className="font-semibold">
                                            {emp.prenom} {emp.nom}
                                          </div>
                                          <div className="text-gray-600">
                                            {metier?.libelle ?? "—"} · {heuresTotal}h
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })}
                                  {isEmpty && !isLocked && (
                                    <EmptyCellPicker
                                      employes={employes}
                                      metiersById={metiersById}
                                      hint={dragEmp ? "Déposer ici" : undefined}
                                      onPick={(emp) => openCreateDialog(emp, af, obj, d)}
                                    />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                        );
                      })}
                    </FragmentWithKey>
                  );
                })}
                {affairesRetenues.every(
                  (af) => (objetsByAffaire.get(af.id)?.length ?? 0) === 0,
                ) && (
                  <tr>
                    <td
                      colSpan={days.length + 1}
                      className="p-6 text-center text-sm text-muted-foreground"
                    >
                      Aucun objet de fabrication actif sur les chantiers filtrés.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Sidebar Employés (drag source) */}
        <aside className="hidden w-[220px] shrink-0 lg:block">
          <div className="sticky top-0 rounded-lg border bg-card p-2">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
              <Package className="h-3.5 w-3.5 text-primary" />
              Glisser un employé
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Rechercher…"
                value={searchEmp}
                onChange={(e) => setSearchEmp(e.target.value)}
                className="h-7 pl-7 text-xs"
              />
            </div>
            <div className="max-h-[600px] space-y-1 overflow-y-auto">
              {employesFiltres.map((emp) => {
                const metier = metiersById.get(emp.metier_principal_id);
                const isDragging = dragEmp?.id === emp.id;
                return (
                  <div
                    key={emp.id}
                    draggable
                    onDragStart={() => setDragEmp(emp)}
                    onDragEnd={() => {
                      setDragEmp(null);
                      setDragOverKey(null);
                    }}
                    className={cn(
                      "flex cursor-grab items-center gap-1.5 rounded border bg-card px-1.5 py-1 text-[11px] active:cursor-grabbing hover:bg-muted",
                      isDragging && "opacity-50",
                    )}
                    title={`${emp.prenom} ${emp.nom} — ${metier?.libelle ?? ""}`}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: metier?.couleur ?? "#94a3b8" }}
                    />
                    <span className="truncate">
                      {emp.prenom} {emp.nom}
                    </span>
                  </div>
                );
              })}
              {employesFiltres.length === 0 && (
                <div className="p-2 text-center text-[10px] text-muted-foreground">
                  Aucun employé
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Dialog assignation */}
      {assignDlg && (
        <AssignationDialog
          open
          onOpenChange={(o) => !o && setAssignDlg(null)}
          date={assignDlg.date}
          employe={assignDlg.employe}
          existing={assignDlg.existing}
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
          defaultAffaireId={assignDlg.affaireId || undefined}
          defaultObjetId={assignDlg.objetId || undefined}
          onSaved={() => {
            setAssignDlg(null);
            refreshLinks();
            onChanged?.();
          }}
        />
      )}
    </TooltipProvider>
  );
}

interface EmptyCellPickerProps {
  employes: Employe[];
  metiersById: Map<number, Metier>;
  hint?: string;
  onPick: (emp: Employe) => void;
}

function EmptyCellPicker({ employes, metiersById, hint, onPick }: EmptyCellPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="mx-auto inline-flex items-center gap-1 self-center rounded-full border border-dashed border-muted-foreground/30 px-2 py-0.5 text-[10px] text-muted-foreground/70 hover:border-primary hover:bg-primary/5 hover:text-primary"
          title="Staffer un employé sur cet objet"
        >
          <Plus className="h-3 w-3" />
          {hint ?? "Staffer"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Rechercher un employé…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>
              <div className="flex items-center justify-center gap-1.5 py-3 text-xs text-muted-foreground">
                <UserPlus className="h-3.5 w-3.5" />
                Aucun employé
              </div>
            </CommandEmpty>
            <CommandGroup>
              {employes
                .slice()
                .sort((a, b) =>
                  `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, "fr"),
                )
                .map((emp) => {
                  const metier = metiersById.get(emp.metier_principal_id);
                  return (
                    <CommandItem
                      key={emp.id}
                      value={`${emp.prenom} ${emp.nom}`}
                      onSelect={() => {
                        setOpen(false);
                        onPick(emp);
                      }}
                      className="text-xs"
                    >
                      <span
                        className="mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: metier?.couleur ?? "#94a3b8" }}
                      />
                      <span className="truncate">
                        {emp.prenom} {emp.nom}
                      </span>
                      {metier && (
                        <span className="ml-auto truncate text-[10px] text-muted-foreground">
                          {metier.libelle}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
