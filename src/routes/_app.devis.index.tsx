import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, ArrowRight, Trash2, FileText, ExternalLink, Plus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type DevisStatut = "brouillon" | "signe" | "facture";

interface DevisRow {
  id: string;
  numero: string;
  libelle: string | null;
  montant_ht: number | null;
  date_signature: string | null;
  statut: DevisStatut;
  created_at: string;
  affaire: { id: string; numero: string; nom: string } | null;
  total_heures: number;
  nb_postes: number;
  nb_assignations: number;
  heures_reelles_validees: number;
  heures_reelles_soumises: number;
}

function pctRealisationBadge(prevues: number, validees: number) {
  if (prevues <= 0) return { label: "—", cls: "text-muted-foreground" };
  const pct = (validees / prevues) * 100;
  const txt = `${pct.toFixed(0)} %`;
  if (pct > 115) return { label: txt, cls: "bg-destructive/15 text-destructive font-semibold" };
  if (pct >= 95) return { label: txt, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold" };
  return { label: txt, cls: "bg-green-500/15 text-green-700 dark:text-green-400 font-semibold" };
}

export const Route = createFileRoute("/_app/devis/")({
  head: () => ({ meta: [{ title: "Devis — Setup Paris" }] }),
  component: DevisPage,
});

function DevisPage() {
  const { isAdminOrChef } = useAuth();
  const [rows, setRows] = useState<DevisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState<DevisStatut | "all">("all");
  const [affaireFilter, setAffaireFilter] = useState<string>("all");
  const [toDelete, setToDelete] = useState<DevisRow | null>(null);
  const [editForm, setEditForm] = useState<Partial<DevisRow> | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const { data: dv } = await supabase
      .from("devis")
      .select("id, numero, libelle, montant_ht, date_signature, statut, created_at, affaire:affaires(id, numero, nom)")
      .order("created_at", { ascending: false });
    const ids = (dv ?? []).map((d) => d.id);
    let postesByDevis = new Map<string, { count: number; heures: number }>();
    let assignByDevis = new Map<string, number>();
    let consoByDevis = new Map<string, { validees: number; soumises: number }>();
    if (ids.length) {
      const { data: pst } = await supabase
        .from("devis_postes").select("devis_id, heures_prevues").in("devis_id", ids);
      (pst ?? []).forEach((p) => {
        const cur = postesByDevis.get(p.devis_id) ?? { count: 0, heures: 0 };
        cur.count += 1; cur.heures += Number(p.heures_prevues ?? 0);
        postesByDevis.set(p.devis_id, cur);
      });
      const { data: ass } = await supabase
        .from("assignations").select("devis_id").in("devis_id", ids);
      (ass ?? []).forEach((a) => {
        if (!a.devis_id) return;
        assignByDevis.set(a.devis_id, (assignByDevis.get(a.devis_id) ?? 0) + 1);
      });
      const { data: cons } = await supabase
        .from("v_devis_consommation")
        .select("devis_id, heures_reelles_validees, heures_reelles_soumises")
        .in("devis_id", ids);
      (cons ?? []).forEach((c) => {
        if (!c.devis_id) return;
        const cur = consoByDevis.get(c.devis_id) ?? { validees: 0, soumises: 0 };
        cur.validees += Number(c.heures_reelles_validees ?? 0);
        cur.soumises += Number(c.heures_reelles_soumises ?? 0);
        consoByDevis.set(c.devis_id, cur);
      });
    }
    setRows(
      (dv ?? []).map((d) => ({
        id: d.id,
        numero: d.numero,
        libelle: d.libelle,
        montant_ht: d.montant_ht,
        date_signature: d.date_signature,
        statut: d.statut as DevisStatut,
        created_at: d.created_at,
        affaire: d.affaire as DevisRow["affaire"],
        total_heures: postesByDevis.get(d.id)?.heures ?? 0,
        nb_postes: postesByDevis.get(d.id)?.count ?? 0,
        nb_assignations: assignByDevis.get(d.id) ?? 0,
        heures_reelles_validees: consoByDevis.get(d.id)?.validees ?? 0,
        heures_reelles_soumises: consoByDevis.get(d.id)?.soumises ?? 0,
      })),
    );
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const affaires = useMemo(() => {
    const map = new Map<string, { id: string; numero: string; nom: string }>();
    rows.forEach((r) => { if (r.affaire) map.set(r.affaire.id, r.affaire); });
    return Array.from(map.values()).sort((a, b) => a.numero.localeCompare(b.numero));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statutFilter !== "all" && r.statut !== statutFilter) return false;
      if (affaireFilter !== "all" && r.affaire?.id !== affaireFilter) return false;
      if (!q) return true;
      return [r.numero, r.libelle, r.affaire?.numero, r.affaire?.nom]
        .filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
    });
  }, [rows, search, statutFilter, affaireFilter]);

  const totals = useMemo(() => ({
    nb: filtered.length,
    heures: filtered.reduce((s, r) => s + r.total_heures, 0),
    montant: filtered.reduce((s, r) => s + (r.montant_ht ?? 0), 0),
  }), [filtered]);

  const handleDelete = async () => {
    if (!toDelete) return;
    const { error: detachErr } = await supabase
      .from("assignations").update({ devis_id: null }).eq("devis_id", toDelete.id);
    if (detachErr) { toast.error("Suppression impossible", { description: detachErr.message }); setToDelete(null); return; }
    const { error } = await supabase.from("devis").delete().eq("id", toDelete.id);
    if (error) toast.error("Suppression impossible", { description: error.message });
    else toast.success(`Devis ${toDelete.numero} supprimé. ${toDelete.nb_assignations} assignation(s) détachée(s).`);
    setToDelete(null);
    fetchAll();
  };

  const handleSaveEdit = async () => {
    if (!editForm?.id) return;
    if (!editForm.numero?.toString().trim()) { toast.error("Numéro requis"); return; }
    setSavingEdit(true);
    const { error } = await supabase.from("devis").update({
      numero: editForm.numero.toString().trim(),
      libelle: editForm.libelle?.toString().trim() || null,
      montant_ht: editForm.montant_ht ?? null,
      date_signature: editForm.date_signature || null,
      statut: editForm.statut as DevisStatut,
    }).eq("id", editForm.id);
    setSavingEdit(false);
    if (error) { toast.error("Mise à jour impossible", { description: error.message }); return; }
    toast.success("Devis mis à jour");
    setEditForm(null);
    fetchAll();
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        eyebrow="Pilotage commercial"
        title="Devis"
        description="Tous les devis importés ou créés. Édition par affaire, suppression avec détachement des assignations."
        actions={
          isAdminOrChef && (
            <Button asChild className="rounded-xl">
              <Link to="/devis/import">
                <Plus className="h-4 w-4" />
                Nouveau devis
              </Link>
            </Button>
          )
        }
      />

      {/* Filtres */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="N° devis, libellé, affaire…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl pl-9"
          />
        </div>
        <Select value={affaireFilter} onValueChange={setAffaireFilter}>
          <SelectTrigger className="h-10 w-[220px] rounded-xl"><SelectValue placeholder="Affaire" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les affaires</SelectItem>
            {affaires.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.numero} — {a.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs value={statutFilter} onValueChange={(v) => setStatutFilter(v as DevisStatut | "all")}>
          <TabsList className="rounded-xl">
            <TabsTrigger value="all" className="rounded-lg">Tous</TabsTrigger>
            <TabsTrigger value="brouillon" className="rounded-lg">Brouillon</TabsTrigger>
            <TabsTrigger value="signe" className="rounded-lg">Signé</TabsTrigger>
            <TabsTrigger value="facture" className="rounded-lg">Facturé</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPIs */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Devis" value={String(totals.nb)} />
        <KpiCard label="Heures prévues" value={`${totals.heures.toFixed(1)} h`} />
        <KpiCard label="Montant HT cumulé" value={`${totals.montant.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`} />
      </div>

      {/* Table */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">Aucun devis</p>
            <p className="mt-1 text-xs text-muted-foreground">Importez un devis ou créez-en un depuis une affaire.</p>
            <Link to="/devis/import" className="mt-3 inline-flex items-center text-xs font-semibold text-primary">
              Aller à l'import <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° devis</TableHead>
                <TableHead>Affaire</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Postes</TableHead>
                <TableHead className="text-right">Heures prévues</TableHead>
                <TableHead className="text-right" title="Heures saisies validées">Consommé validé</TableHead>
                <TableHead className="text-right" title="Heures saisies en attente de validation">En attente</TableHead>
                <TableHead className="text-right" title="Heures validées / Heures prévues">% réalisation</TableHead>
                <TableHead className="text-right">Montant HT</TableHead>
                <TableHead className="text-right">Assignations</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs font-bold text-primary">{r.numero}</TableCell>
                  <TableCell>
                    {r.affaire ? (
                      <Link to="/affaires/$affaireId" params={{ affaireId: r.affaire.id }}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:text-primary">
                        {r.affaire.numero}
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{r.affaire.nom}</span>
                      </Link>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">{r.libelle ?? "—"}</TableCell>
                  <TableCell><DevisStatutBadge statut={r.statut} /></TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.nb_postes}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.total_heures.toFixed(1)} h</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {r.heures_reelles_validees > 0 ? `${r.heures_reelles_validees.toFixed(1)} h` : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">
                    {r.heures_reelles_soumises > 0 ? `${r.heures_reelles_soumises.toFixed(1)} h` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {(() => {
                      const b = pctRealisationBadge(r.total_heures, r.heures_reelles_validees);
                      return <span className={`inline-flex rounded-full px-2 py-0.5 font-mono text-xs ${b.cls}`}>{b.label}</span>;
                    })()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">
                    {r.montant_ht != null ? `${Number(r.montant_ht).toLocaleString("fr-FR")} €` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">{r.nb_assignations}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {isAdminOrChef && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" title="Modifier le devis"
                          onClick={() => setEditForm(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {r.affaire && (
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg" title="Ouvrir dans l'affaire (lignes)">
                          <Link to="/affaires/$affaireId/devis" params={{ affaireId: r.affaire.id }}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                      {isAdminOrChef && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive"
                          onClick={() => setToDelete(r)} title="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Édition rapide */}
      <Dialog open={!!editForm} onOpenChange={(o) => !o && setEditForm(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Modifier le devis {editForm?.numero}</DialogTitle>
            <DialogDescription>
              Modifie les méta-données du devis. Pour éditer les lignes (postes par métier), utilise le bouton « Ouvrir dans l'affaire ».
            </DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Numéro</Label>
                <Input value={editForm.numero ?? ""} onChange={(e) => setEditForm({ ...editForm, numero: e.target.value })} className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={(editForm.statut as DevisStatut) ?? "signe"} onValueChange={(v) => setEditForm({ ...editForm, statut: v as DevisStatut })}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brouillon">Brouillon</SelectItem>
                    <SelectItem value="signe">Signé</SelectItem>
                    <SelectItem value="facture">Facturé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Libellé</Label>
                <Input value={editForm.libelle ?? ""} onChange={(e) => setEditForm({ ...editForm, libelle: e.target.value })} className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Montant HT (€)</Label>
                <Input type="number" step="0.01" value={editForm.montant_ht ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, montant_ht: e.target.value === "" ? null : Number(e.target.value) })}
                  className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Date de signature</Label>
                <Input type="date" value={editForm.date_signature ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, date_signature: e.target.value || null })}
                  className="h-10 rounded-xl" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditForm(null)} className="rounded-xl">Annuler</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le devis {toDelete?.numero} ?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.nb_assignations
                ? `${toDelete.nb_assignations} assignation(s) liée(s) seront détachée(s) (conservées sur l'affaire, sans rattachement devis).`
                : "Aucune assignation rattachée. Les postes seront supprimés en cascade."}
              {" "}Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="overline">— {label}</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function DevisStatutBadge({ statut }: { statut: DevisStatut }) {
  const cfg = {
    brouillon: { label: "Brouillon", cls: "bg-muted text-muted-foreground" },
    signe: { label: "Signé", cls: "bg-primary/15 text-primary" },
    facture: { label: "Facturé", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
  }[statut];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}>{cfg.label}</span>;
}
