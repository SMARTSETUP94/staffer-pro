import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeftRight, Check, ClipboardCheck, Clock, Download, Filter, History, Loader2, X } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WeekPicker } from "@/components/planning/WeekPicker";
import { cn } from "@/lib/utils";
import { exportHeuresSilae, type HeuresExportRow } from "@/lib/heures-export";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";

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
  saisi_par_chef: boolean | null;
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
        "id, date, employe_id, affaire_id, heure_debut, heure_fin, heures_reelles, commentaire, statut, motif_rejet, valide_le, rejete_le, saisi_par_chef, employe:employes(prenom, nom), affaire:affaires(numero, nom), assignation:assignations(metier:metiers(libelle, couleur))",
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
    const { data, error } = await supabase
      .from("heures_saisies")
      .update({ statut: "valide" })
      .in("id", ids)
      .eq("statut", "soumis")
      .select("id");
    if (error) {
      toast.error(error.message);
      return;
    }
    const updated = data?.length ?? 0;
    const ignored = ids.length - updated;
    if (updated === 0) {
      toast.warning("Aucune saisie validée : elles ont déjà été traitées par un autre chef.");
    } else if (ignored > 0) {
      toast.warning(`${updated} validée(s), ${ignored} ignorée(s) (déjà traitée(s) par un autre chef).`);
    } else {
      toast.success(`${updated} saisie(s) validée(s)`);
    }
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
    const { data, error } = await supabase
      .from("heures_saisies")
      .update({ statut: "rejete", motif_rejet: rejectMotif.trim() })
      .in("id", rejectDialog.ids)
      .eq("statut", "soumis")
      .select("id");
    if (error) {
      toast.error(error.message);
      return;
    }
    const updated = data?.length ?? 0;
    const ignored = rejectDialog.ids.length - updated;
    if (updated === 0) {
      toast.warning("Aucune saisie rejetée : elles ont déjà été traitées par un autre chef.");
    } else if (ignored > 0) {
      toast.warning(`${updated} rejetée(s), ${ignored} ignorée(s) (déjà traitée(s) par un autre chef).`);
    } else {
      toast.success(`${updated} saisie(s) rejetée(s)`);
    }
    setRejectDialog({ ids: [], open: false });
    setRejectMotif("");
    setReloadKey((k) => k + 1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      // Export SILAE = uniquement validées dans la période/filtres actuels
      // Pagination par pages de 1000 pour éviter toute troncature silencieuse
      const PAGE_SIZE = 1000;
      const all: HeuresExportRow[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from("heures_saisies")
          .select(
            "id, date, heure_debut, heure_fin, heures_reelles, heures_nuit, commentaire, statut, valide_le, motif_rejet, devis_id, employe:employes(prenom, nom, type_contrat, metier_principal:metiers!employes_metier_principal_id_fkey(libelle), profile:profiles(matricule_silae)), affaire:affaires(numero, nom, lieu, phase), assignation:assignations(metier:metiers(libelle)), valideur:profiles!heures_saisies_valide_par_fkey(full_name, email)",
          )
          .gte("date", startStr)
          .lte("date", endStr)
          .eq("statut", "valide")
          .order("date")
          .range(from, from + PAGE_SIZE - 1);
        if (employeFilter !== "all") q = q.eq("employe_id", employeFilter);
        if (affaireFilter !== "all") q = q.eq("affaire_id", affaireFilter);
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data ?? []) as unknown as HeuresExportRow[];
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      if (all.length === 0) {
        toast.warning("Aucune saisie validée à exporter sur cette période.");
        return;
      }
      await exportHeuresSilae(all, { weekStart, weekEnd });
      toast.success(`Export SILAE généré — ${all.length} ligne(s) (CSV + XLSX)`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur export");
    } finally {
      setExporting(false);
    }
  };

  const selectedIds = Array.from(selected);

  // render
  return (
    <div className="space-y-6 p-6">
      <PageBreadcrumbs steps={[{ label: "Équipes" }, { label: "Validation des heures" }]} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Validation</h1>
            <p className="text-sm text-muted-foreground">
              Validez les heures saisies et arbitrez les demandes d'échange.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="heures" className="space-y-4">
        <TabsList>
          <TabsTrigger value="heures" className="gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" /> Heures à valider
          </TabsTrigger>
          <TabsTrigger value="swaps" className="gap-1.5">
            <ArrowLeftRight className="h-3.5 w-3.5" /> Swaps à valider
            <SwapsBadgeCount />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="heures" className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
        <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-2">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exporter validées
        </Button>
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
        </TabsContent>

        <TabsContent value="swaps">
          <SwapsValidationTab />
        </TabsContent>
      </Tabs>

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

function SwapsBadgeCount() {
  const { rows } = useMesSwaps({ chefView: true });
  if (rows.length === 0) return null;
  return (
    <Badge variant="destructive" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
      {rows.length}
    </Badge>
  );
}

function SwapsValidationTab() {
  const { rows, loading, refresh } = useMesSwaps({ chefView: true });
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }
  return (
    <SwapsList
      rows={rows}
      currentEmployeId={null}
      chefMode
      onChanged={refresh}
      emptyMessage="Aucun swap en attente de validation."
    />
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
      <div className="flex items-center gap-1">
        <HistoryDrawer saisieId={row.id} />
        {row.statut === "soumis" && (
          <>
            <Button size="sm" variant="ghost" onClick={onValidate} className="h-8 gap-1 text-emerald-700 hover:text-emerald-800 dark:text-emerald-400" title="Valider">
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onReject} className="h-8 gap-1 text-red-700 hover:text-red-800 dark:text-red-400" title="Rejeter">
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

interface HistoriqueRow {
  id: string;
  created_at: string;
  ancien_statut: "brouillon" | "soumis" | "valide" | "rejete" | null;
  nouveau_statut: "brouillon" | "soumis" | "valide" | "rejete";
  commentaire: string | null;
  user_id: string | null;
  user: { full_name: string | null; email: string } | null;
}

const STATUT_LABEL: Record<string, string> = {
  brouillon: "Brouillon",
  soumis: "Soumis",
  valide: "Validé",
  rejete: "Rejeté",
};

const STATUT_CLASS: Record<string, string> = {
  brouillon: "bg-muted text-muted-foreground",
  soumis: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  valide: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejete: "bg-red-500/15 text-red-700 dark:text-red-400",
};

function HistoryDrawer({ saisieId }: { saisieId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HistoriqueRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("heures_saisies_historique")
      .select("id, created_at, ancien_statut, nouveau_statut, commentaire, user_id, user:profiles(full_name, email)")
      .eq("heure_saisie_id", saisieId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setItems((data ?? []) as unknown as HistoriqueRow[]);
        setLoading(false);
      });
  }, [open, saisieId]);

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="h-8 gap-1 text-muted-foreground hover:text-foreground"
        title="Historique"
      >
        <History className="h-3.5 w-3.5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> Historique des transitions
            </SheetTitle>
            <SheetDescription>
              Toutes les modifications de statut de cette saisie, du plus récent au plus ancien.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="mt-4 h-[calc(100vh-9rem)] pr-3">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Aucune transition enregistrée.
              </p>
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-4">
                {items.map((it) => {
                  const who = it.user?.full_name ?? it.user?.email ?? "Système";
                  return (
                    <li key={it.id} className="relative">
                      <span className="absolute -left-[1.4rem] top-1 inline-block h-2 w-2 rounded-full bg-primary ring-4 ring-background" />
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(it.created_at), "EEE d MMM yyyy 'à' HH:mm", { locale: fr })}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        {it.ancien_statut && (
                          <>
                            <Badge variant="outline" className={cn("text-[10px]", STATUT_CLASS[it.ancien_statut])}>
                              {STATUT_LABEL[it.ancien_statut]}
                            </Badge>
                            <span className="text-muted-foreground">→</span>
                          </>
                        )}
                        <Badge variant="outline" className={cn("text-[10px]", STATUT_CLASS[it.nouveau_statut])}>
                          {STATUT_LABEL[it.nouveau_statut]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-foreground">
                        <span className="font-semibold">Par :</span> {who}
                      </p>
                      {it.commentaire && (
                        <p className="mt-1 rounded-md bg-muted/40 px-2 py-1.5 text-xs italic text-muted-foreground">
                          {it.commentaire}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
