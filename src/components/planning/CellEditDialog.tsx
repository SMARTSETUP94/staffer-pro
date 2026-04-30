import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import type {
  Affaire,
  Assignation,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";

interface FabObjetLite {
  id: string;
  reference: string;
  nom: string;
  affaire_id: string;
  heures_prevues_total: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: Date;
  objet: FabObjetLite;
  affaire: Affaire;
  cellAssigns: Assignation[];
  employes: Employe[];
  metiers: Metier[];
  /** total heures déjà assignées sur cet objet (toutes dates) */
  heuresObjetTotal: number;
  onChanged: () => void;
}

interface Row {
  assignation_id: string;
  employe_id: string;
  metier_id: number;
  heures: number;
  initialHeures: number;
  toDelete?: boolean;
}

interface NewRow {
  tempId: string;
  employe_id: string;
  metier_id: number;
  heures: number;
}

/** v0.27 — Édition groupée de toutes les affectations d'une cellule (objet × jour). */
export function CellEditDialog({
  open,
  onOpenChange,
  date,
  objet,
  affaire,
  cellAssigns,
  employes,
  metiers,
  heuresObjetTotal,
  onChanged,
}: Props) {
  const employesById = useMemo(
    () => new Map(employes.map((e) => [e.id, e])),
    [employes],
  );
  const metiersById = useMemo(
    () => new Map(metiers.map((m) => [m.id, m])),
    [metiers],
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows(
      cellAssigns.map((a) => ({
        assignation_id: a.id,
        employe_id: a.employe_id,
        metier_id: a.metier_id,
        heures: Number(a.heures || 0),
        initialHeures: Number(a.heures || 0),
      })),
    );
    setNewRows([]);
  }, [open, cellAssigns]);

  const dateStr = format(date, "yyyy-MM-dd");

  // Heures totales à venir sur l'objet (après save) pour aperçu dépassement
  const heuresApres = useMemo(() => {
    const deltaExist = rows.reduce(
      (s, r) => s + (r.toDelete ? -r.initialHeures : r.heures - r.initialHeures),
      0,
    );
    const deltaNew = newRows.reduce((s, r) => s + Number(r.heures || 0), 0);
    return heuresObjetTotal + deltaExist + deltaNew;
  }, [rows, newRows, heuresObjetTotal]);

  const heuresPrev = objet.heures_prevues_total;
  const ecart = heuresPrev > 0 ? heuresApres - heuresPrev : 0;

  // employés déjà présents dans la cellule (pour exclure du picker)
  const usedEmpIds = useMemo(() => {
    const s = new Set<string>();
    rows.filter((r) => !r.toDelete).forEach((r) => s.add(r.employe_id));
    newRows.forEach((r) => s.add(r.employe_id));
    return s;
  }, [rows, newRows]);

  const employesDispo = useMemo(
    () =>
      employes
        .filter((e) => !usedEmpIds.has(e.id))
        .sort((a, b) =>
          `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, "fr"),
        ),
    [employes, usedEmpIds],
  );

  function updateRowHeures(id: string, h: number) {
    setRows((rs) => rs.map((r) => (r.assignation_id === id ? { ...r, heures: h } : r)));
  }

  function toggleDelete(id: string) {
    setRows((rs) =>
      rs.map((r) => (r.assignation_id === id ? { ...r, toDelete: !r.toDelete } : r)),
    );
  }

  function addNewRow(emp: Employe) {
    setNewRows((ns) => [
      ...ns,
      {
        tempId: `new-${Date.now()}-${Math.random()}`,
        employe_id: emp.id,
        metier_id: emp.metier_principal_id,
        heures: 7,
      },
    ]);
    setPickerOpen(false);
  }

  function updateNewRow(tempId: string, patch: Partial<NewRow>) {
    setNewRows((ns) => ns.map((n) => (n.tempId === tempId ? { ...n, ...patch } : n)));
  }

  function removeNewRow(tempId: string) {
    setNewRows((ns) => ns.filter((n) => n.tempId !== tempId));
  }

  async function handleSave() {
    // Validation
    for (const r of rows) {
      if (r.toDelete) continue;
      if (r.heures <= 0 || r.heures > 12) {
        toast.error("Heures invalides (0 < h ≤ 12)");
        return;
      }
    }
    for (const n of newRows) {
      if (n.heures <= 0 || n.heures > 12) {
        toast.error("Heures invalides pour le nouvel employé (0 < h ≤ 12)");
        return;
      }
    }

    setSaving(true);
    try {
      // 1) Suppressions
      const toDeleteIds = rows.filter((r) => r.toDelete).map((r) => r.assignation_id);
      if (toDeleteIds.length > 0) {
        const { error } = await supabase
          .from("assignations")
          .delete()
          .in("id", toDeleteIds);
        if (error) throw error;
      }

      // 2) Updates des heures modifiées
      const toUpdate = rows.filter(
        (r) => !r.toDelete && r.heures !== r.initialHeures,
      );
      for (const r of toUpdate) {
        const { error } = await supabase
          .from("assignations")
          .update({ heures: r.heures })
          .eq("id", r.assignation_id);
        if (error) throw error;
      }

      // 3) Inserts des nouvelles assignations + lien objet
      for (const n of newRows) {
        const { data, error } = await supabase
          .from("assignations")
          .insert({
            employe_id: n.employe_id,
            affaire_id: affaire.id,
            metier_id: n.metier_id,
            heures: n.heures,
            date: dateStr,
            demi_journee: "journee",
          })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("insert assignation");
        const { error: linkErr } = await supabase
          .from("assignation_objets")
          .insert({ assignation_id: data.id, objet_id: objet.id });
        if (linkErr) throw linkErr;
      }

      toast.success("Cellule mise à jour");
      onChanged();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Erreur : ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  const visibleRows = rows.filter((r) => true); // garder même si toDelete pour permettre annuler

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Affectations du {format(date, "EEEE dd MMMM", { locale: fr })}</DialogTitle>
          <DialogDescription>
            <span className="font-mono font-bold">{affaire.numero}</span>
            <span className="ml-2">{affaire.nom}</span>
            <br />
            <span className="font-mono text-xs font-bold">{objet.reference}</span>
            <span className="ml-2 text-xs">{objet.nom}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Récap budget objet */}
          {heuresPrev > 0 && (
            <div className="rounded-md border bg-muted/40 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span>Budget objet :</span>
                <span className="font-mono">
                  {heuresApres}h / {heuresPrev}h
                </span>
              </div>
              {ecart > 0 && (
                <div className="mt-0.5 text-destructive font-medium">
                  ⚠ Dépassement après modification : +{ecart}h
                </div>
              )}
            </div>
          )}

          {/* Lignes existantes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Employés affectés ({rows.filter((r) => !r.toDelete).length + newRows.length})</Label>
            {visibleRows.length === 0 && newRows.length === 0 && (
              <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
                Aucune affectation. Ajoute un employé ci-dessous.
              </div>
            )}
            {visibleRows.map((r) => {
              const emp = employesById.get(r.employe_id);
              const metier = metiersById.get(r.metier_id);
              return (
                <div
                  key={r.assignation_id}
                  className={
                    "flex items-center gap-2 rounded border p-1.5 " +
                    (r.toDelete ? "opacity-50 line-through" : "")
                  }
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: metier?.couleur ?? "#94a3b8" }}
                  />
                  <span className="flex-1 truncate text-xs font-medium">
                    {emp ? `${emp.prenom} ${emp.nom}` : "—"}
                    <span className="ml-1 text-muted-foreground">
                      · {metier?.libelle ?? "—"}
                    </span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={12}
                    step={0.5}
                    value={r.heures}
                    disabled={r.toDelete}
                    onChange={(e) =>
                      updateRowHeures(r.assignation_id, Number(e.target.value))
                    }
                    className="h-7 w-16 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">h</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => toggleDelete(r.assignation_id)}
                    title={r.toDelete ? "Annuler suppression" : "Supprimer"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}

            {/* Nouvelles lignes */}
            {newRows.map((n) => {
              const emp = employesById.get(n.employe_id);
              const metier = metiersById.get(n.metier_id);
              return (
                <div
                  key={n.tempId}
                  className="flex items-center gap-2 rounded border border-primary/40 bg-primary/5 p-1.5"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: metier?.couleur ?? "#94a3b8" }}
                  />
                  <span className="flex-1 truncate text-xs font-medium">
                    {emp ? `${emp.prenom} ${emp.nom}` : "—"}
                    <span className="ml-1 text-muted-foreground">
                      · {metier?.libelle ?? "—"}
                    </span>
                    <span className="ml-1 rounded bg-primary/15 px-1 text-[9px] font-bold text-primary">
                      NEW
                    </span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={12}
                    step={0.5}
                    value={n.heures}
                    onChange={(e) =>
                      updateNewRow(n.tempId, { heures: Number(e.target.value) })
                    }
                    className="h-7 w-16 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">h</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => removeNewRow(n.tempId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Picker ajouter employé */}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Ajouter un employé
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Rechercher un employé…" className="h-8 text-xs" />
                <CommandList>
                  <CommandEmpty>
                    <div className="py-3 text-center text-xs text-muted-foreground">
                      Aucun employé disponible
                    </div>
                  </CommandEmpty>
                  <CommandGroup>
                    {employesDispo.map((emp) => {
                      const metier = metiersById.get(emp.metier_principal_id);
                      return (
                        <CommandItem
                          key={emp.id}
                          value={`${emp.prenom} ${emp.nom}`}
                          onSelect={() => addNewRow(emp)}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
