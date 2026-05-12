import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Palette, Plus, Save, Trash2, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { MetiersPostesTabs } from "@/components/parametres/MetiersPostesTabs";

export const Route = createFileRoute("/_app/parametres/metiers")({
  head: () => ({ meta: [{ title: "Métiers — Paramètres" }] }),
  component: MetiersPage,
});

interface MetierRow {
  id: number;
  code: string;
  libelle: string;
  couleur: string;
  ordre: number;
  nb_employes: number;
  nb_assignations: number;
  nb_devis_postes: number;
}

const OKLCH_RE = /^oklch\(\s*[0-9.]+%?\s+[0-9.]+\s+[0-9.]+\s*\)$/i;

function isValidOklch(v: string) {
  return OKLCH_RE.test(v.trim());
}

/** Convertit oklch(L% C H) ou oklch(L C H) en hex approximatif via canvas pour <input type="color">. */
function oklchToHex(oklch: string): string {
  if (typeof document === "undefined") return "#888888";
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return "#888888";
    ctx.fillStyle = oklch;
    const computed = ctx.fillStyle; // navigateur normalise en rgb()/hex
    if (computed.startsWith("#")) return computed;
    // rgb(r, g, b) → hex
    const m = computed.match(/\d+/g);
    if (!m || m.length < 3) return "#888888";
    const [r, g, b] = m.map((n) => Number(n));
    return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  } catch {
    return "#888888";
  }
}

/** Convertit hex #rrggbb → oklch(L% C H) approximatif. */
function hexToOklch(hex: string): string {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return "oklch(0.7 0.1 0)";
  const [r, g, b] = m.map((h) => parseInt(h, 16) / 255);
  // sRGB → linéaire
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lr = lin(r), lg = lin(g), lb = lin(b);
  // OKLab (Björn Ottosson)
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)})`;
}

interface EditState {
  open: boolean;
  mode: "create" | "edit";
  id?: number;
  code: string;
  libelle: string;
  couleur: string;
  ordre: number;
}

const EMPTY_EDIT: EditState = {
  open: false, mode: "create", code: "", libelle: "", couleur: "oklch(0.7 0.15 250)", ordre: 0,
};

function MetiersPage() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<MetierRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MetierRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/planning" });
  }, [loading, isAdmin, navigate]);

  useEffect(() => {
    if (isAdmin) loadRows();
  }, [isAdmin]);

  async function loadRows() {
    setLoadingRows(true);
    const [mRes, eRes, aRes, dRes] = await Promise.all([
      supabase.from("metiers").select("id, code, libelle, couleur, ordre").order("ordre").order("libelle"),
      supabase.from("employes").select("metier_principal_id"),
      supabase.from("assignations").select("metier_id"),
      supabase.from("devis_postes").select("metier_id"),
    ]);
    if (mRes.error) {
      toast.error("Erreur chargement métiers : " + mRes.error.message);
      setLoadingRows(false);
      return;
    }
    const empCount = new Map<number, number>();
    eRes.data?.forEach((e) => {
      empCount.set(e.metier_principal_id, (empCount.get(e.metier_principal_id) ?? 0) + 1);
    });
    const assCount = new Map<number, number>();
    aRes.data?.forEach((a) => {
      if (a.metier_id == null) return;
      assCount.set(a.metier_id, (assCount.get(a.metier_id) ?? 0) + 1);
    });
    const devisCount = new Map<number, number>();
    dRes.data?.forEach((d) => {
      devisCount.set(d.metier_id, (devisCount.get(d.metier_id) ?? 0) + 1);
    });
    setRows(
      (mRes.data ?? []).map((m) => ({
        ...m,
        nb_employes: empCount.get(m.id) ?? 0,
        nb_assignations: assCount.get(m.id) ?? 0,
        nb_devis_postes: devisCount.get(m.id) ?? 0,
      })),
    );
    setLoadingRows(false);
  }

  function openCreate() {
    const nextOrdre = rows.length > 0 ? Math.max(...rows.map((r) => r.ordre)) + 10 : 10;
    setEdit({ ...EMPTY_EDIT, open: true, mode: "create", ordre: nextOrdre });
  }

  function openEdit(row: MetierRow) {
    setEdit({
      open: true, mode: "edit", id: row.id,
      code: row.code, libelle: row.libelle, couleur: row.couleur, ordre: row.ordre,
    });
  }

  async function handleSave() {
    const code = edit.code.trim().toLowerCase().replace(/\s+/g, "_");
    const libelle = edit.libelle.trim();
    const couleur = edit.couleur.trim();
    if (!code) return toast.error("Code requis");
    if (!libelle) return toast.error("Libellé requis");
    if (!isValidOklch(couleur)) return toast.error("Couleur OKLCH invalide. Format : oklch(L% C H) ou oklch(L C H)");

    setSaving(true);
    if (edit.mode === "create") {
      const { error } = await supabase.from("metiers").insert({
        code, libelle, couleur, ordre: edit.ordre,
      });
      if (error) {
        toast.error("Erreur création : " + error.message);
        setSaving(false);
        return;
      }
      toast.success(`Métier "${libelle}" créé`);
    } else if (edit.id != null) {
      const { error } = await supabase.from("metiers").update({
        code, libelle, couleur, ordre: edit.ordre,
      }).eq("id", edit.id);
      if (error) {
        toast.error("Erreur modification : " + error.message);
        setSaving(false);
        return;
      }
      toast.success(`Métier "${libelle}" modifié`);
    }
    setSaving(false);
    setEdit(EMPTY_EDIT);
    loadRows();
  }

  async function moveOrder(row: MetierRow, dir: -1 | 1) {
    const sorted = [...rows].sort((a, b) => a.ordre - b.ordre);
    const idx = sorted.findIndex((r) => r.id === row.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    const { error: e1 } = await supabase.from("metiers").update({ ordre: swap.ordre }).eq("id", row.id);
    const { error: e2 } = await supabase.from("metiers").update({ ordre: row.ordre }).eq("id", swap.id);
    if (e1 || e2) {
      toast.error("Erreur réordonnancement : " + (e1 ?? e2)!.message);
      return;
    }
    loadRows();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const total = confirmDelete.nb_employes + confirmDelete.nb_assignations + confirmDelete.nb_devis_postes;
    if (total > 0) {
      toast.error("Suppression bloquée : ce métier est encore utilisé.");
      setConfirmDelete(null);
      return;
    }
    setDeleting(true);
    const { error } = await supabase.from("metiers").delete().eq("id", confirmDelete.id);
    setDeleting(false);
    if (error) {
      toast.error("Erreur suppression : " + error.message);
      return;
    }
    toast.success(`Métier "${confirmDelete.libelle}" supprimé`);
    setConfirmDelete(null);
    loadRows();
  }

  const totalUsage = useMemo(
    () => rows.reduce((acc, r) => acc + r.nb_employes + r.nb_assignations + r.nb_devis_postes, 0),
    [rows],
  );

  if (loading || !isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const hexPicker = isValidOklch(edit.couleur) ? oklchToHex(edit.couleur) : "#888888";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Palette className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Gestion des métiers</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Métiers</CardTitle>
              <CardDescription className="mt-1.5">
                {rows.length} métier{rows.length > 1 ? "s" : ""} — {totalUsage} usage{totalUsage > 1 ? "s" : ""} au total.
                La suppression est bloquée si le métier est utilisé.
              </CardDescription>
            </div>
            <Dialog open={edit.open} onOpenChange={(o) => !o && setEdit(EMPTY_EDIT)}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 shrink-0" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nouveau métier
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {edit.mode === "create" ? "Créer un métier" : "Modifier le métier"}
                  </DialogTitle>
                  <DialogDescription>
                    Le code est utilisé en interne (snake_case). Le libellé est affiché aux utilisateurs.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="m-code">Code *</Label>
                    <Input
                      id="m-code"
                      placeholder="ex: peinture"
                      value={edit.code}
                      onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-libelle">Libellé *</Label>
                    <Input
                      id="m-libelle"
                      placeholder="ex: Peinture"
                      value={edit.libelle}
                      onChange={(e) => setEdit({ ...edit, libelle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-couleur">Couleur OKLCH *</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={hexPicker}
                        onChange={(e) => setEdit({ ...edit, couleur: hexToOklch(e.target.value) })}
                        className="h-9 w-12 rounded border cursor-pointer"
                        aria-label="Sélecteur couleur"
                      />
                      <Input
                        id="m-couleur"
                        placeholder="oklch(0.7 0.15 250)"
                        value={edit.couleur}
                        onChange={(e) => setEdit({ ...edit, couleur: e.target.value })}
                        className={!isValidOklch(edit.couleur) ? "border-destructive" : ""}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">Aperçu :</span>
                      <span
                        className="inline-block h-5 w-5 rounded border"
                        style={{ background: isValidOklch(edit.couleur) ? edit.couleur : "transparent" }}
                      />
                      <Badge style={{ background: isValidOklch(edit.couleur) ? edit.couleur : undefined }}>
                        {edit.libelle || "Aperçu"}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-ordre">Ordre d'affichage</Label>
                    <Input
                      id="m-ordre"
                      type="number"
                      value={edit.ordre}
                      onChange={(e) => setEdit({ ...edit, ordre: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEdit(EMPTY_EDIT)} disabled={saving}>
                    Annuler
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                    <Save className="h-4 w-4 mr-1.5" />
                    {edit.mode === "create" ? "Créer" : "Enregistrer"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loadingRows ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Aucun métier.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Ordre</TableHead>
                  <TableHead>Couleur</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead className="text-right">Employés</TableHead>
                  <TableHead className="text-right">Assignations</TableHead>
                  <TableHead className="text-right">Postes devis</TableHead>
                  <TableHead className="w-[200px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows].sort((a, b) => a.ordre - b.ordre).map((r, i, arr) => {
                  const used = r.nb_employes + r.nb_assignations + r.nb_devis_postes > 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-mono w-6">{r.ordre}</span>
                          <Button
                            size="icon" variant="ghost" className="h-6 w-6"
                            disabled={i === 0}
                            onClick={() => moveOrder(r, -1)}
                            title="Monter"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-6 w-6"
                            disabled={i === arr.length - 1}
                            onClick={() => moveOrder(r, 1)}
                            title="Descendre"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-5 w-5 rounded border"
                            style={{ background: r.couleur }}
                          />
                          <code className="text-[10px] text-muted-foreground">{r.couleur}</code>
                        </div>
                      </TableCell>
                      <TableCell><code className="text-xs">{r.code}</code></TableCell>
                      <TableCell className="font-medium">{r.libelle}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.nb_employes}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.nb_assignations}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.nb_devis_postes}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                            Modifier
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                            disabled={used}
                            onClick={() => setConfirmDelete(r)}
                            title={used ? "Métier utilisé — suppression bloquée" : "Supprimer"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Supprimer le métier "{confirmDelete?.libelle}" ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le métier sera retiré du référentiel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
