import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeftRight, Check, ClipboardCheck, Download, Filter, Loader2, X } from "lucide-react";
import { useMesSwaps } from "@/hooks/use-mes-swaps";
import { SwapsList } from "@/components/swaps/SwapsList";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { cn } from "@/lib/utils";
import { exportHeuresXlsx } from "@/lib/heures-export";

export const Route = createFileRoute("/_app/validation-heures")({
  head: () => ({ meta: [{ title: "Validation heures — Planning chantiers" }] }),
  component: ValidationHeuresPage,
});

interface SaisieRow {
  id: string;
  date: string;
  employe_id: string;
  affaire_id: string;
  heure_debut: string | null;
  heure_fin: string | null;
  heures_reelles: number | null;
  commentaire: string | null;
  statut: "brouillon" | "soumis" | "valide" | "rejete";
  motif_rejet: string | null;
  valide_le: string | null;
  rejete_le: string | null;
  employe: { prenom: string; nom: string } | null;
  affaire: { numero: string; nom: string } | null;
  assignation: { metier: { libelle: string; couleur: string } | null } | null;
}

type StatutFilter = "soumis" | "valide" | "rejete" | "all";

function ValidationHeuresPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [statutFilter, setStatutFilter] = useState<StatutFilter>("soumis");
  const [employeFilter, setEmployeFilter] = useState<string>("all");
  const [affaireFilter, setAffaireFilter] = useState<string>("all");
  const [employes, setEmployes] = useState<{ id: string; prenom: string; nom: string }[]>([]);
  const [affaires, setAffaires] = useState<{ id: string; numero: string; nom: string }[]>([]);
  const [rows, setRows] = useState<SaisieRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const [rejectDialog, setRejectDialog] = useState<{ ids: string[]; open: boolean }>({ ids: [], open: false });
  const [rejectMotif, setRejectMotif] = useState("");
  const [exporting, setExporting] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(weekEnd, "yyyy-MM-dd");

  // Charger employés + affaires (pour filtres)
  useEffect(() => {
    Promise.all([
      supabase.from("employes").select("id, prenom, nom").eq("actif", true).order("nom"),
      supabase.from("affaires").select("id, numero, nom").in("statut", ["en_cours", "prospect"]).order("numero"),
    ]).then(([eRes, aRes]) => {
      setEmployes((eRes.data ?? []) as any);
      setAffaires((aRes.data ?? []) as any);
    });
  }, []);

  // Charger saisies
  useEffect(() => {
    setLoading(true);
    let q = supabase
      .from("heures_saisies")
      .select(
        "id, date, employe_id, affaire_id, heure_debut, heure_fin, heures_reelles, commentaire, statut, motif_rejet, valide_le, rejete_le, employe:employes(prenom, nom), affaire:affaires(numero, nom), assignation:assignations(metier:metiers(libelle, couleur))",
      )
      .gte("date", startStr)
      .lte("date", endStr)
      .order("date")
      .limit(1000);
    if (statutFilter !== "all") q = q.eq("statut", statutFilter);
    if (employeFilter !== "all") q = q.eq("employe_id", employeFilter);
    if (affaireFilter !== "all") q = q.eq("affaire_id", affaireFilter);
    q.then(({ data, error }) => {
      if (error) toast.error(error.message);
      setRows((data ?? []) as unknown as SaisieRow[]);
      setSelected(new Set());
      setLoading(false);
    });
  }, [startStr, endStr, statutFilter, employeFilter, affaireFilter, reloadKey]);

  // Grouper par employé pour bulk semaine
  const groupedByEmploye = useMemo(() => {
    const map = new Map<string, { employe: { id: string; prenom: string; nom: string }; rows: SaisieRow[] }>();
    for (const r of rows) {
      if (!r.employe) continue;
      const k = r.employe_id;
      if (!map.has(k)) {
        map.set(k, { employe: { id: k, prenom: r.employe.prenom, nom: r.employe.nom }, rows: [] });
      }
      map.get(k)!.rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.employe.nom.localeCompare(b.employe.nom));
  }, [rows]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const validateBulk = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("heures_saisies")
      .update({ statut: "valide" })
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${ids.length} saisie(s) validée(s)`);
    setReloadKey((k) => k + 1);
  };

  const openRejectDialog = (ids: string[]) => {
    if (ids.length === 0) return;
    setRejectDialog({ ids, open: true });
    setRejectMotif("");
  };

  const confirmReject = async () => {
    if (!rejectMotif.trim()) {
      toast.error("Le motif est obligatoire");
      return;
    }
    const { error } = await supabase
      .from("heures_saisies")
      .update({ statut: "rejete", motif_rejet: rejectMotif.trim() })
      .in("id", rejectDialog.ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${rejectDialog.ids.length} saisie(s) rejetée(s)`);
    setRejectDialog({ ids: [], open: false });
    setRejectMotif("");
    setReloadKey((k) => k + 1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Export = uniquement validées dans la période/filtres actuels
      let q = supabase
        .from("heures_saisies")
        .select(
          "id, date, heure_debut, heure_fin, heures_reelles, commentaire, statut, valide_le, employe:employes(prenom, nom), affaire:affaires(numero, nom)",
        )
        .gte("date", startStr)
        .lte("date", endStr)
        .eq("statut", "valide")
        .order("date")
        .limit(5000);
      if (employeFilter !== "all") q = q.eq("employe_id", employeFilter);
      if (affaireFilter !== "all") q = q.eq("affaire_id", affaireFilter);
      const { data, error } = await q;
      if (error) throw error;
      await exportHeuresXlsx(data as any, { weekStart, weekEnd });
      toast.success(`${data?.length ?? 0} ligne(s) exportée(s)`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur export");
    } finally {
      setExporting(false);
    }
  };

  const selectedIds = Array.from(selected);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Validation des heures</h1>
            <p className="text-sm text-muted-foreground">
              Validez ou rejetez les saisies soumises par les employés.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
          <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exporter validées
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
            <Filter className="h-4 w-4" />
            Filtres :
          </div>

          <Tabs value={statutFilter} onValueChange={(v) => setStatutFilter(v as StatutFilter)}>
            <TabsList>
              <TabsTrigger value="soumis">À valider</TabsTrigger>
              <TabsTrigger value="valide">Validées</TabsTrigger>
              <TabsTrigger value="rejete">Rejetées</TabsTrigger>
              <TabsTrigger value="all">Toutes</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="min-w-[200px]">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Employé</Label>
            <Select value={employeFilter} onValueChange={setEmployeFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {employes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[200px]">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Affaire</Label>
            <Select value={affaireFilter} onValueChange={setAffaireFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {affaires.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.numero} — {a.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedIds.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {selectedIds.length} sélectionnée(s)
              </span>
              <Button size="sm" onClick={() => validateBulk(selectedIds)} className="gap-1">
                <Check className="h-3.5 w-3.5" /> Valider
              </Button>
              <Button size="sm" variant="destructive" onClick={() => openRejectDialog(selectedIds)} className="gap-1">
                <X className="h-3.5 w-3.5" /> Rejeter
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : groupedByEmploye.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucune saisie ne correspond aux filtres sur cette semaine.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedByEmploye.map((group) => {
            const submittableIds = group.rows.filter((r) => r.statut === "soumis").map((r) => r.id);
            return (
              <Card key={group.employe.id}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-bold">
                        {group.employe.prenom} {group.employe.nom}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {group.rows.length} ligne(s) ·{" "}
                        {group.rows.reduce((acc, r) => acc + Number(r.heures_reelles ?? 0), 0)}h
                      </span>
                    </div>
                    {submittableIds.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => validateBulk(submittableIds)} className="gap-1">
                          <Check className="h-3.5 w-3.5" /> Valider la semaine ({submittableIds.length})
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openRejectDialog(submittableIds)} className="gap-1">
                          <X className="h-3.5 w-3.5" /> Rejeter la semaine
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="divide-y divide-border">
                    {group.rows.map((r) => (
                      <RowItem
                        key={r.id}
                        row={r}
                        selected={selected.has(r.id)}
                        onToggle={() => toggleSelect(r.id)}
                        onValidate={() => validateBulk([r.id])}
                        onReject={() => openRejectDialog([r.id])}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog rejet */}
      <Dialog open={rejectDialog.open} onOpenChange={(o) => setRejectDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter {rejectDialog.ids.length} saisie(s)</DialogTitle>
            <DialogDescription>
              L'employé devra prendre connaissance du motif avant de pouvoir re-soumettre.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motif">Motif de rejet (obligatoire)</Label>
            <Textarea
              id="motif"
              value={rejectMotif}
              onChange={(e) => setRejectMotif(e.target.value)}
              placeholder="Ex : heures incohérentes avec le planning, mauvaise affectation…"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ ids: [], open: false })}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={confirmReject} disabled={!rejectMotif.trim()}>
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowItem({
  row,
  selected,
  onToggle,
  onValidate,
  onReject,
}: {
  row: SaisieRow;
  selected: boolean;
  onToggle: () => void;
  onValidate: () => void;
  onReject: () => void;
}) {
  const canSelect = row.statut === "soumis";
  const statutBadge: Record<string, string> = {
    brouillon: "bg-muted text-muted-foreground",
    soumis: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    valide: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    rejete: "bg-red-500/15 text-red-700 dark:text-red-400",
  };

  return (
    <div className={cn("flex items-start gap-3 px-4 py-3", selected && "bg-primary/5")}>
      <div className="pt-1">
        <Checkbox checked={selected} disabled={!canSelect} onCheckedChange={onToggle} />
      </div>
      <span
        className="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: row.assignation?.metier?.couleur ?? "#94a3b8" }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold capitalize text-muted-foreground">
            {format(new Date(row.date), "EEE d MMM", { locale: fr })}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {row.affaire?.numero} — {row.affaire?.nom}
          </span>
          <Badge variant="outline" className={cn("text-[10px]", statutBadge[row.statut])}>
            {row.statut}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{row.heures_reelles ?? 0}h</strong>
            {row.heure_debut && row.heure_fin && (
              <span> ({row.heure_debut.slice(0, 5)} → {row.heure_fin.slice(0, 5)})</span>
            )}
          </span>
          {row.assignation?.metier && <span>{row.assignation.metier.libelle}</span>}
          {row.commentaire && <span className="italic">"{row.commentaire}"</span>}
        </div>
        {row.statut === "rejete" && row.motif_rejet && (
          <p className="mt-1 text-xs text-red-700 dark:text-red-400">
            <strong>Motif :</strong> {row.motif_rejet}
          </p>
        )}
      </div>
      {row.statut === "soumis" && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onValidate} className="h-8 gap-1 text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onReject} className="h-8 gap-1 text-red-700 hover:text-red-800 dark:text-red-400">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
