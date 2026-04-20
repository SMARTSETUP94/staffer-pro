import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Loader2, Pencil, Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMetiers } from "@/hooks/use-metiers";
import { MetierBadge } from "@/components/MetierBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type DevisStatut = "brouillon" | "signe" | "facture";

interface Devis {
  id: string;
  numero: string;
  libelle: string | null;
  montant_ht: number | null;
  date_signature: string | null;
  statut: DevisStatut;
}

interface Poste {
  id: string;
  devis_id: string;
  metier_id: number;
  heures_prevues: number;
  montant_ht: number | null;
  libelle_source: string | null;
}

export const Route = createFileRoute("/_app/affaires/$affaireId/devis")({
  component: AffaireDevisPage,
});

function AffaireDevisPage() {
  const { affaireId } = Route.useParams();
  const { isAdminOrChef } = useAuth();
  const { metiers, byId } = useMetiers();

  const [devis, setDevis] = useState<Devis[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [loading, setLoading] = useState(true);

  // Devis dialog
  const [devisOpen, setDevisOpen] = useState(false);
  const [devisForm, setDevisForm] = useState<Partial<Devis>>({});
  const [savingDevis, setSavingDevis] = useState(false);

  // Poste dialog
  const [posteOpen, setPosteOpen] = useState(false);
  const [posteForm, setPosteForm] = useState<Partial<Poste> & { devis_id: string }>({ devis_id: "" });
  const [savingPoste, setSavingPoste] = useState(false);

  // Suppression
  const [toDelete, setToDelete] = useState<{ kind: "devis" | "poste"; id: string; label: string } | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const { data: dv } = await supabase
      .from("devis")
      .select("id, numero, libelle, montant_ht, date_signature, statut")
      .eq("affaire_id", affaireId)
      .order("created_at", { ascending: true });
    const ids = (dv ?? []).map((d) => d.id);
    let pst: Poste[] = [];
    if (ids.length) {
      const { data } = await supabase
        .from("devis_postes")
        .select("id, devis_id, metier_id, heures_prevues, montant_ht, libelle_source")
        .in("devis_id", ids)
        .order("created_at", { ascending: true });
      pst = (data ?? []) as Poste[];
    }
    setDevis((dv ?? []) as Devis[]);
    setPostes(pst);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [affaireId]);

  const openCreateDevis = () => {
    setDevisForm({ numero: "", libelle: "", montant_ht: null, date_signature: null, statut: "signe" });
    setDevisOpen(true);
  };
  const openEditDevis = (d: Devis) => { setDevisForm(d); setDevisOpen(true); };

  const handleSaveDevis = async () => {
    if (!devisForm.numero?.trim()) {
      toast.error("Numéro requis"); return;
    }
    setSavingDevis(true);
    const payload = {
      affaire_id: affaireId,
      numero: devisForm.numero.trim(),
      libelle: devisForm.libelle?.trim() || null,
      montant_ht: devisForm.montant_ht ?? null,
      date_signature: devisForm.date_signature || null,
      statut: (devisForm.statut ?? "signe") as DevisStatut,
    };
    if (devisForm.id) {
      const { error } = await supabase.from("devis").update(payload).eq("id", devisForm.id);
      if (error) { toast.error("Mise à jour impossible", { description: error.message }); setSavingDevis(false); return; }
      toast.success("Devis mis à jour");
    } else {
      const { error } = await supabase.from("devis").insert(payload);
      if (error) { toast.error("Création impossible", { description: error.message }); setSavingDevis(false); return; }
      toast.success("Devis créé");
    }
    setDevisOpen(false);
    setSavingDevis(false);
    fetchAll();
  };

  const openCreatePoste = (devisId: string) => {
    setPosteForm({ devis_id: devisId, metier_id: metiers[0]?.id, heures_prevues: 0, montant_ht: null, libelle_source: "" });
    setPosteOpen(true);
  };
  const openEditPoste = (p: Poste) => { setPosteForm({ ...p }); setPosteOpen(true); };

  const handleSavePoste = async () => {
    if (!posteForm.metier_id || posteForm.heures_prevues == null) {
      toast.error("Métier et heures requis"); return;
    }
    setSavingPoste(true);
    const payload = {
      devis_id: posteForm.devis_id,
      metier_id: posteForm.metier_id,
      heures_prevues: Number(posteForm.heures_prevues),
      montant_ht: posteForm.montant_ht ?? null,
      libelle_source: posteForm.libelle_source?.trim() || null,
    };
    if (posteForm.id) {
      const { error } = await supabase.from("devis_postes").update(payload).eq("id", posteForm.id);
      if (error) { toast.error("Mise à jour impossible", { description: error.message }); setSavingPoste(false); return; }
      toast.success("Ligne mise à jour");
    } else {
      const { error } = await supabase.from("devis_postes").insert(payload);
      if (error) { toast.error("Création impossible", { description: error.message }); setSavingPoste(false); return; }
      toast.success("Ligne ajoutée");
    }
    setPosteOpen(false);
    setSavingPoste(false);
    fetchAll();
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    if (toDelete.kind === "devis") {
      // Détacher les assignations liées (devis_id = null) avant suppression
      const { error: detachErr } = await supabase
        .from("assignations").update({ devis_id: null }).eq("devis_id", toDelete.id);
      if (detachErr) {
        toast.error("Suppression impossible", { description: detachErr.message });
        setToDelete(null); return;
      }
      const { error } = await supabase.from("devis").delete().eq("id", toDelete.id);
      if (error) toast.error("Suppression impossible", { description: error.message });
      else toast.success("Devis supprimé. Assignations détachées (conservées sur l'affaire).");
    } else {
      const { error } = await supabase.from("devis_postes").delete().eq("id", toDelete.id);
      if (error) toast.error("Suppression impossible", { description: error.message });
      else toast.success("Ligne supprimée");
    }
    setToDelete(null);
    fetchAll();
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="overline">— Devis ({devis.length})</p>
        {isAdminOrChef && (
          <Button onClick={openCreateDevis} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> Nouveau devis
          </Button>
        )}
      </div>

      {devis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">Aucun devis enregistré</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Créez un devis manuellement ou utilisez l'import dans la section dédiée.
          </p>
        </div>
      ) : (
        devis.map((d) => {
          const lines = postes.filter((p) => p.devis_id === d.id);
          const totalH = lines.reduce((s, l) => s + Number(l.heures_prevues), 0);
          return (
            <div key={d.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/40 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs font-bold text-primary">{d.numero}</span>
                  <span className="text-sm font-semibold text-foreground">{d.libelle ?? "Sans libellé"}</span>
                  <DevisStatutPill statut={d.statut} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {totalH.toFixed(1)} h {d.montant_ht != null && <>· {Number(d.montant_ht).toLocaleString("fr-FR")} € HT</>}
                  </span>
                  {isAdminOrChef && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEditDevis(d)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive"
                        onClick={() => setToDelete({ kind: "devis", id: d.id, label: `devis ${d.numero}` })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {lines.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Aucune ligne. Ajoutez les postes par métier.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Métier</TableHead>
                      <TableHead>Libellé source</TableHead>
                      <TableHead className="text-right">Heures prévues</TableHead>
                      <TableHead className="text-right">Montant HT</TableHead>
                      {isAdminOrChef && <TableHead className="w-[80px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((p) => {
                      const m = byId(p.metier_id);
                      return (
                        <TableRow key={p.id}>
                          <TableCell>{m && <MetierBadge libelle={m.libelle} couleur={m.couleur} />}</TableCell>
                          <TableCell className="text-sm">{p.libelle_source ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{Number(p.heures_prevues).toFixed(1)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {p.montant_ht != null ? `${Number(p.montant_ht).toLocaleString("fr-FR")} €` : "—"}
                          </TableCell>
                          {isAdminOrChef && (
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEditPoste(p)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive"
                                  onClick={() => setToDelete({ kind: "poste", id: p.id, label: `ligne ${m?.libelle ?? ""}` })}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {isAdminOrChef && (
                <div className="border-t border-border bg-background/40 px-4 py-2">
                  <Button variant="ghost" size="sm" className="rounded-lg text-primary" onClick={() => openCreatePoste(d.id)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter une ligne
                  </Button>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Dialog devis */}
      <Dialog open={devisOpen} onOpenChange={setDevisOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{devisForm.id ? "Modifier le devis" : "Nouveau devis"}</DialogTitle>
            <DialogDescription>
              Le numéro est l'identifiant interne du devis. Les heures sont saisies par ligne (postes par métier).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Numéro</Label>
              <Input value={devisForm.numero ?? ""} onChange={(e) => setDevisForm({ ...devisForm, numero: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={devisForm.statut ?? "signe"} onValueChange={(v) => setDevisForm({ ...devisForm, statut: v as DevisStatut })}>
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
              <Input value={devisForm.libelle ?? ""} onChange={(e) => setDevisForm({ ...devisForm, libelle: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Montant HT (€)</Label>
              <Input type="number" step="0.01" value={devisForm.montant_ht ?? ""}
                onChange={(e) => setDevisForm({ ...devisForm, montant_ht: e.target.value === "" ? null : Number(e.target.value) })}
                className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Date de signature</Label>
              <Input type="date" value={devisForm.date_signature ?? ""}
                onChange={(e) => setDevisForm({ ...devisForm, date_signature: e.target.value || null })}
                className="h-10 rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDevisOpen(false)} className="rounded-xl">Annuler</Button>
            <Button onClick={handleSaveDevis} disabled={savingDevis} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              {savingDevis && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {devisForm.id ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog ligne (poste) */}
      <Dialog open={posteOpen} onOpenChange={setPosteOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{posteForm.id ? "Modifier la ligne" : "Nouvelle ligne"}</DialogTitle>
            <DialogDescription>
              Une ligne = un métier et un nombre d'heures prévues. Le libellé source reprend le texte du devis original (optionnel).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Métier</Label>
              <Select
                value={posteForm.metier_id ? String(posteForm.metier_id) : ""}
                onValueChange={(v) => setPosteForm({ ...posteForm, metier_id: Number(v) })}
              >
                <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                <SelectContent>
                  {metiers.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Heures prévues</Label>
              <Input type="number" step="0.5" value={posteForm.heures_prevues ?? 0}
                onChange={(e) => setPosteForm({ ...posteForm, heures_prevues: Number(e.target.value) })}
                className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Montant HT (€)</Label>
              <Input type="number" step="0.01" value={posteForm.montant_ht ?? ""}
                onChange={(e) => setPosteForm({ ...posteForm, montant_ht: e.target.value === "" ? null : Number(e.target.value) })}
                className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Libellé source (optionnel)</Label>
              <Textarea value={posteForm.libelle_source ?? ""} onChange={(e) => setPosteForm({ ...posteForm, libelle_source: e.target.value })} rows={2} className="rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPosteOpen(false)} className="rounded-xl">Annuler</Button>
            <Button onClick={handleSavePoste} disabled={savingPoste} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              {savingPoste && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {posteForm.id ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {toDelete?.label} ?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.kind === "devis"
                ? "Toutes les lignes de ce devis seront supprimées. Les assignations liées seront détachées (conservées sur l'affaire, sans rattachement devis). Cette action est irréversible."
                : "Cette ligne sera supprimée. Cette action est irréversible."}
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

function DevisStatutPill({ statut }: { statut: DevisStatut }) {
  const map: Record<DevisStatut, { label: string; cls: string }> = {
    brouillon: { label: "Brouillon", cls: "bg-[var(--cream-deep)] text-foreground" },
    signe:     { label: "Signé",     cls: "bg-[var(--indigo-soft)] text-primary" },
    facture:   { label: "Facturé",   cls: "bg-emerald-100 text-emerald-700" },
  };
  const v = map[statut];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${v.cls}`}>
      {v.label}
    </span>
  );
}
