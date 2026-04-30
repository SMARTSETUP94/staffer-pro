import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Pencil, Trash2, FileText, CheckCircle2, Lock, AlertTriangle, Download } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMetiers } from "@/hooks/use-metiers";
import { MetierBadge } from "@/components/MetierBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
import { cn } from "@/lib/utils";
import { DevisDeleteCascadeDialog } from "@/components/devis-import/DevisDeleteCascadeDialog";

/** v0.15.1 — Statuts UI exposés. Les autres (en_cours, cloture, facture) restent
 *  dormants en DB pour flexibilité future mais ne sont pas proposés à la sélection. */
type DevisStatut = "brouillon" | "signe" | "en_cours" | "termine" | "facture" | "cloture";
type DevisStatutEditable = "signe" | "termine";

interface Devis {
  id: string;
  numero: string;
  libelle: string | null;
  montant_ht: number | null;
  date_signature: string | null;
  statut: DevisStatut;
  date_debut_phase: string | null;
  date_fin_phase: string | null;
  livre_le: string | null;
  livre_par: string | null;
}

interface Poste {
  id: string;
  devis_id: string;
  metier_id: number;
  heures_prevues: number;
  montant_ht: number | null;
  libelle_source: string | null;
}

/** Heures réellement assignées à un (devis, métier) — calculé depuis assignations. */
type HeuresAssignParCouple = Map<string, number>; // key: `${devis_id}::${metier_id}`

export const Route = createFileRoute("/_app/affaires/$affaireId/devis")({
  component: AffaireDevisPage,
});

function formatLibelleSource(raw: string | null): string {
  if (!raw) return "—";
  const parts = raw.split("•").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return raw;
  if (parts.length === 1) return parts[0];
  const counts = new Map<string, number>();
  for (const p of parts) counts.set(p, (counts.get(p) ?? 0) + 1);
  const unique = Array.from(counts.entries());
  if (unique.length === 1) {
    const [label, n] = unique[0];
    return n > 1 ? `${label} ×${n}` : label;
  }
  return unique.map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(" • ");
}

function AffaireDevisPage() {
  const { affaireId } = Route.useParams();
  const { isAdminOrChef, isAdmin } = useAuth();
  const { metiers, byId } = useMetiers();

  const [devis, setDevis] = useState<Devis[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [heuresAssign, setHeuresAssign] = useState<HeuresAssignParCouple>(new Map());
  const [loading, setLoading] = useState(true);

  // Devis dialog
  const [devisOpen, setDevisOpen] = useState(false);
  const [devisForm, setDevisForm] = useState<Partial<Devis>>({});
  const [savingDevis, setSavingDevis] = useState(false);

  // Poste dialog
  const [posteOpen, setPosteOpen] = useState(false);
  const [posteForm, setPosteForm] = useState<Partial<Poste> & { devis_id: string }>({ devis_id: "" });
  const [savingPoste, setSavingPoste] = useState(false);

  // Suppression poste (devis géré par DevisDeleteCascadeDialog)
  const [toDelete, setToDelete] = useState<{ kind: "poste"; id: string; label: string } | null>(null);
  const [devisToDelete, setDevisToDelete] = useState<string | null>(null);

  // v0.15.1 — Dialog de livraison (Signé → Terminé)
  const [toDeliver, setToDeliver] = useState<Devis | null>(null);
  const [delivering, setDelivering] = useState(false);

  // v0.15.1 — Dialog de ré-ouverture (admin only)
  const [toReopen, setToReopen] = useState<Devis | null>(null);
  const [reopening, setReopening] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const { data: dv } = await supabase
      .from("devis")
      .select("id, numero, libelle, montant_ht, date_signature, statut, date_debut_phase, date_fin_phase, livre_le, livre_par")
      .eq("affaire_id", affaireId)
      .order("created_at", { ascending: true });
    const ids = (dv ?? []).map((d) => d.id);
    let pst: Poste[] = [];
    const heuresMap: HeuresAssignParCouple = new Map();
    if (ids.length) {
      const [{ data: postesData }, { data: assignData }] = await Promise.all([
        supabase
          .from("devis_postes")
          .select("id, devis_id, metier_id, heures_prevues, montant_ht, libelle_source")
          .in("devis_id", ids)
          .order("created_at", { ascending: true }),
        supabase
          .from("assignations")
          .select("devis_id, metier_id, heures")
          .in("devis_id", ids),
      ]);
      pst = (postesData ?? []) as Poste[];
      ((assignData ?? []) as { devis_id: string; metier_id: number; heures: number }[]).forEach((a) => {
        const key = `${a.devis_id}::${a.metier_id}`;
        heuresMap.set(key, (heuresMap.get(key) ?? 0) + Number(a.heures || 0));
      });
    }
    setDevis((dv ?? []) as Devis[]);
    setPostes(pst);
    setHeuresAssign(heuresMap);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [affaireId]);

  const openCreateDevis = () => {
    setDevisForm({
      numero: "",
      libelle: "",
      montant_ht: null,
      date_signature: null,
      statut: "signe",
      date_debut_phase: null,
      date_fin_phase: null,
    });
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
      date_debut_phase: devisForm.date_debut_phase || null,
      date_fin_phase: devisForm.date_fin_phase || null,
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
    const { error } = await supabase.from("devis_postes").delete().eq("id", toDelete.id);
    if (error) toast.error("Suppression impossible", { description: error.message });
    else toast.success("Ligne supprimée");
    setToDelete(null);
    fetchAll();
  };

  // v0.15.1 — Workflow livraison
  const handleDeliver = async () => {
    if (!toDeliver) return;
    setDelivering(true);
    const { error } = await supabase
      .from("devis")
      .update({ statut: "termine" as DevisStatut })
      .eq("id", toDeliver.id);
    setDelivering(false);
    if (error) {
      toast.error("Livraison impossible", { description: error.message });
      return;
    }
    toast.success(`Lot ${toDeliver.numero} livré. Le planning et les heures de ce lot sont maintenant verrouillés.`);
    setToDeliver(null);
    fetchAll();
  };

  const handleReopen = async () => {
    if (!toReopen) return;
    setReopening(true);
    const { error } = await supabase
      .from("devis")
      .update({ statut: "signe" as DevisStatut })
      .eq("id", toReopen.id);
    setReopening(false);
    if (error) {
      toast.error("Ré-ouverture impossible", { description: error.message });
      return;
    }
    toast.success(`Lot ${toReopen.numero} ré-ouvert. Les éditions futures seront tracées dans l'historique.`);
    setToReopen(null);
    fetchAll();
  };

  // Totaux par devis (heures prévues vs assignées)
  const totauxParDevis = useMemo(() => {
    const map = new Map<string, { prevues: number; assignees: number }>();
    devis.forEach((d) => {
      const lines = postes.filter((p) => p.devis_id === d.id);
      const prevues = lines.reduce((s, l) => s + Number(l.heures_prevues || 0), 0);
      const assignees = lines.reduce(
        (s, l) => s + (heuresAssign.get(`${d.id}::${l.metier_id}`) ?? 0),
        0,
      );
      map.set(d.id, { prevues, assignees });
    });
    return map;
  }, [devis, postes, heuresAssign]);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="overline">— Devis ({devis.length})</p>
        {isAdminOrChef && (
          <div className="flex items-center gap-2">
            <Button asChild className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/devis/import" search={{ affaire_id: affaireId }}>
                <Download className="mr-2 h-4 w-4" /> Importer un devis Progbat
              </Link>
            </Button>
            <Button variant="outline" onClick={openCreateDevis} className="rounded-xl">
              <Plus className="mr-2 h-4 w-4" /> Devis manuel
            </Button>
          </div>
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
          const totals = totauxParDevis.get(d.id) ?? { prevues: 0, assignees: 0 };
          const pct = totals.prevues > 0 ? Math.round((totals.assignees / totals.prevues) * 100) : 0;
          const isLivre = d.statut === "termine";
          const peutLivrer = isAdminOrChef && d.statut === "signe";
          const peutReouvrir = isAdmin && d.statut === "termine";
          const lockedForChef = isLivre && !isAdmin;

          return (
            <div key={d.id} className={cn(
              "overflow-hidden rounded-2xl border bg-card",
              isLivre ? "border-emerald-500/40" : "border-border",
            )}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/40 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs font-bold text-primary">{d.numero}</span>
                  <span className="text-sm font-semibold text-foreground">{d.libelle ?? "Sans libellé"}</span>
                  <DevisStatutPill statut={d.statut} />
                  {isLivre && d.livre_le && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      Livré le {format(new Date(d.livre_le), "dd/MM/yyyy", { locale: fr })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {totals.prevues.toFixed(1)} h prévues
                    {d.montant_ht != null && <> · {Number(d.montant_ht).toLocaleString("fr-FR")} € HT</>}
                  </span>
                  {peutLivrer && (
                    <Button
                      size="sm"
                      onClick={() => setToDeliver(d)}
                      className="h-8 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Terminer ce lot
                    </Button>
                  )}
                  {peutReouvrir && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setToReopen(d)}
                      className="h-8 rounded-lg"
                    >
                      <AlertTriangle className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                      Ré-ouvrir (admin)
                    </Button>
                  )}
                  {isAdminOrChef && !lockedForChef && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEditDevis(d)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive"
                        onClick={() => setDevisToDelete(d.id)}
                        title="Supprimer le devis (cascade)">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* v0.15.1 — Bandeau Période + Avancement */}
              <div className="grid gap-3 border-b border-border bg-background/20 px-4 py-3 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Période</p>
                  <p className="mt-0.5 text-xs text-foreground">
                    {d.date_debut_phase
                      ? format(new Date(d.date_debut_phase), "dd MMM yyyy", { locale: fr })
                      : "—"}
                    {" → "}
                    {d.date_fin_phase
                      ? format(new Date(d.date_fin_phase), "dd MMM yyyy", { locale: fr })
                      : "—"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Avancement (heures assignées / prévues)
                    </p>
                    <p className={cn(
                      "text-xs font-mono font-semibold",
                      pct > 100 ? "text-amber-600" : "text-emerald-700",
                    )}>
                      {totals.assignees.toFixed(1)} / {totals.prevues.toFixed(1)} h · {pct}%
                    </p>
                  </div>
                  <Progress
                    value={Math.min(pct, 100)}
                    className={cn(
                      "mt-1.5 h-2",
                      pct > 100 && "[&>div]:bg-amber-500",
                    )}
                  />
                  {pct > 100 && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> Dépassement budget : +{(totals.assignees - totals.prevues).toFixed(1)} h
                    </p>
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
                      <TableHead className="text-right">Heures assignées</TableHead>
                      <TableHead className="text-right">Montant HT</TableHead>
                      {isAdminOrChef && !lockedForChef && <TableHead className="w-[80px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((p) => {
                      const m = byId(p.metier_id);
                      const assignees = heuresAssign.get(`${d.id}::${p.metier_id}`) ?? 0;
                      const overBudget = assignees > Number(p.heures_prevues);
                      return (
                        <TableRow key={p.id}>
                          <TableCell>{m && <MetierBadge libelle={m.libelle} couleur={m.couleur} />}</TableCell>
                          <TableCell className="text-sm">{formatLibelleSource(p.libelle_source)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{Number(p.heures_prevues).toFixed(1)}</TableCell>
                          <TableCell className={cn(
                            "text-right font-mono text-sm",
                            overBudget ? "text-amber-600 font-semibold" : "text-muted-foreground",
                          )}>
                            {assignees.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {p.montant_ht != null ? `${Number(p.montant_ht).toLocaleString("fr-FR")} €` : "—"}
                          </TableCell>
                          {isAdminOrChef && !lockedForChef && (
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

              {isAdminOrChef && !lockedForChef && (
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

      {/* Dialog devis (création/édition) */}
      <Dialog open={devisOpen} onOpenChange={setDevisOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{devisForm.id ? "Modifier le devis" : "Nouveau devis"}</DialogTitle>
            <DialogDescription>
              Le numéro est l'identifiant interne du devis. Les heures sont saisies par ligne (postes par métier).
              La période sert au mini-Gantt et au sélecteur de lot dans le planning.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Numéro</Label>
              <Input value={devisForm.numero ?? ""} onChange={(e) => setDevisForm({ ...devisForm, numero: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select
                value={(devisForm.statut === "termine" ? "termine" : "signe") as DevisStatutEditable}
                onValueChange={(v) => setDevisForm({ ...devisForm, statut: v as DevisStatut })}
              >
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="signe">Signé</SelectItem>
                  <SelectItem value="termine">Terminé</SelectItem>
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
            <div className="space-y-1.5">
              <Label>Début de phase</Label>
              <Input type="date" value={devisForm.date_debut_phase ?? ""}
                onChange={(e) => setDevisForm({ ...devisForm, date_debut_phase: e.target.value || null })}
                className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Fin de phase</Label>
              <Input type="date" value={devisForm.date_fin_phase ?? ""}
                onChange={(e) => setDevisForm({ ...devisForm, date_fin_phase: e.target.value || null })}
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

      {/* v0.15.1 — Confirmation livraison */}
      <AlertDialog open={!!toDeliver} onOpenChange={(o) => !o && setToDeliver(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Marquer le lot {toDeliver?.numero} comme terminé ?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Cette action verrouille le lot et toutes les assignations / heures qui y sont rattachées :</span>
              <ul className="list-disc pl-5 text-xs">
                <li>Les chefs de chantier ne pourront plus modifier les assignations passées de ce lot.</li>
                <li>Les employés ne pourront plus saisir / modifier d'heures sur ce lot.</li>
                <li>Seul un administrateur pourra ré-ouvrir le lot ou éditer (avec traçabilité).</li>
              </ul>
              <span className="block pt-2 text-xs text-muted-foreground">
                La date et l'auteur de livraison seront enregistrés automatiquement.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={delivering}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeliver}
              disabled={delivering}
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {delivering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer la livraison
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* v0.15.1 — Confirmation ré-ouverture (admin) */}
      <AlertDialog open={!!toReopen} onOpenChange={(o) => !o && setToReopen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Ré-ouvrir le lot {toReopen?.numero} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le lot repassera en "Signé" et redeviendra modifiable par les chefs.
              Les éventuelles modifications post-livraison seront tracées dans l'historique des heures.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={reopening}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReopen}
              disabled={reopening}
              className="rounded-xl bg-amber-600 text-white hover:bg-amber-700"
            >
              {reopening && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ré-ouvrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation suppression poste */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {toDelete?.label} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette ligne sera supprimée. Cette action est irréversible.
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

      {/* v0.31.1 — Suppression cascade devis (réutilise RPC + modale v0.31.0) */}
      <DevisDeleteCascadeDialog
        devisId={devisToDelete}
        onClose={() => setDevisToDelete(null)}
        onConfirmed={() => {
          toast.success("Devis supprimé");
          setDevisToDelete(null);
          fetchAll();
        }}
      />
    </div>
  );
}

function DevisStatutPill({ statut }: { statut: DevisStatut }) {
  const map: Record<DevisStatut, { label: string; cls: string }> = {
    brouillon: { label: "Brouillon", cls: "bg-[var(--cream-deep)] text-foreground" },
    signe:     { label: "Signé",     cls: "bg-amber-100 text-amber-800" },
    en_cours:  { label: "En cours",  cls: "bg-amber-100 text-amber-800" },
    termine:   { label: "Terminé",   cls: "bg-emerald-100 text-emerald-700" },
    facture:   { label: "Facturé",   cls: "bg-emerald-100 text-emerald-700" },
    cloture:   { label: "Clôturé",   cls: "bg-muted text-muted-foreground" },
  };
  const v = map[statut] ?? map.signe;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${v.cls}`}>
      {v.label}
    </span>
  );
}
