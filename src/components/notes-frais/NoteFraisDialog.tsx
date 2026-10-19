import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useAffairesPourLogistique } from "@/hooks/use-etapes-logistiques";
import { analyserJustificatif } from "@/lib/server-fns/notes-frais.functions";
import { NDF_CATEGORIES, NDF_TAUX_TVA, computeHtTva } from "@/lib/notes-frais";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type NoteFraisRow = {
  id: string; user_id: string; date_depense: string; fournisseur: string; categorie: string;
  montant_ttc: number; taux_tva: number; montant_tva: number; montant_ht: number;
  affaire_id: string | null; chantier_libre: string | null; commentaire: string | null;
  justificatif_path: string | null; statut: string; motif_rejet: string | null; created_at: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export function NoteFraisDialog({ open, onOpenChange, note, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; note: NoteFraisRow | null; onSaved: () => void;
}) {
  const { user } = useAuth();
  const analyse = useServerFn(analyserJustificatif);
  const { data: affaires = [] } = useAffairesPourLogistique();
  const [path, setPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "ia" | "save" | null>(null);
  const [f, setF] = useState({ fournisseur: "", date_depense: today(), categorie: "autre", ttc: "", taux: "20", ht: "", tva: "", affaire_id: "", libre: false, chantier_libre: "", commentaire: "" });

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setPath(note?.justificatif_path ?? null);
    setF(note ? {
      fournisseur: note.fournisseur, date_depense: note.date_depense, categorie: note.categorie,
      ttc: String(note.montant_ttc), taux: String(Number(note.taux_tva)), ht: String(note.montant_ht), tva: String(note.montant_tva),
      affaire_id: note.affaire_id ?? "", libre: !note.affaire_id, chantier_libre: note.chantier_libre ?? "", commentaire: note.commentaire ?? "",
    } : { fournisseur: "", date_depense: today(), categorie: "autre", ttc: "", taux: "20", ht: "", tva: "", affaire_id: "", libre: false, chantier_libre: "", commentaire: "" });
    if (note?.justificatif_path) {
      supabase.storage.from("notes-de-frais").createSignedUrl(note.justificatif_path, 600).then(({ data }) => setPreview(data?.signedUrl ?? null));
    }
  }, [open, note]);

  const recalc = (ttc: string, taux: string) => {
    const n = Number(ttc.replace(",", "."));
    if (!Number.isFinite(n) || ttc === "") return { ht: "", tva: "" };
    const r = computeHtTva(n, Number(taux));
    return { ht: String(r.ht), tva: String(r.tva) };
  };

  async function onFile(file: File) {
    if (!user) return;
    setBusy("upload");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const p = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("notes-de-frais").upload(p, file, { contentType: file.type || undefined });
    if (up.error) { setBusy(null); return toast.error(`Envoi impossible : ${up.error.message}`); }
    setPath(p);
    setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    setBusy("ia");
    try {
      const { result, error } = await analyse({ data: { path: p } });
      if (error || !result) { toast.error(error ?? "Lecture impossible"); return; }
      setF((s) => {
        const ttc = result.montant_ttc != null ? String(result.montant_ttc) : s.ttc;
        const taux = result.taux_tva != null && NDF_TAUX_TVA.includes(result.taux_tva as never) ? String(result.taux_tva) : s.taux;
        const calc = recalc(ttc, taux);
        return {
          ...s, ttc, taux,
          fournisseur: result.fournisseur ?? s.fournisseur,
          date_depense: result.date_depense && /^\d{4}-\d{2}-\d{2}$/.test(result.date_depense) ? result.date_depense : s.date_depense,
          categorie: result.categorie ?? s.categorie,
          ht: result.montant_ht != null ? String(result.montant_ht) : calc.ht,
          tva: result.montant_tva != null ? String(result.montant_tva) : calc.tva,
        };
      });
      toast.success("Ticket lu par l'IA — vérifie les champs");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lecture impossible");
    } finally { setBusy(null); }
  }

  async function save() {
    const ttc = Number(f.ttc.replace(",", "."));
    if (!f.fournisseur.trim()) return toast.error("Fournisseur obligatoire");
    if (!Number.isFinite(ttc) || ttc <= 0) return toast.error("Montant TTC invalide");
    if (f.libre ? !f.chantier_libre.trim() : !f.affaire_id) return toast.error("Chantier obligatoire");
    setBusy("save");
    const payload = {
      fournisseur: f.fournisseur.trim(), date_depense: f.date_depense, categorie: f.categorie,
      montant_ttc: ttc, taux_tva: Number(f.taux), montant_ht: Number(f.ht.replace(",", ".")) || 0, montant_tva: Number(f.tva.replace(",", ".")) || 0,
      affaire_id: f.libre ? null : f.affaire_id, chantier_libre: f.libre ? f.chantier_libre.trim() : null,
      commentaire: f.commentaire.trim() || null, justificatif_path: path,
    };
    const { error } = note
      ? await supabase.from("notes_de_frais").update(payload).eq("id", note.id)
      : await supabase.from("notes_de_frais").insert(payload);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(note ? "Note de frais mise à jour" : "Note de frais envoyée pour validation");
    onSaved(); onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{note ? "Modifier la note de frais" : "Nouvelle note de frais"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-md border border-dashed bg-muted/40 text-center text-sm text-muted-foreground hover:bg-muted">
              {preview ? <img src={preview} alt="Justificatif" className="h-full w-full object-contain" />
                : path ? <span>Justificatif PDF joint</span>
                : <><Camera className="h-8 w-8" /><span>Photo ou PDF du ticket</span></>}
              <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ""; }} />
            </label>
            {busy === "upload" && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Envoi…</p>}
            {busy === "ia" && <p className="flex items-center gap-1 text-xs text-primary"><Sparkles className="h-3 w-3 animate-pulse" />L'IA lit le ticket…</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Fournisseur *</Label><Input value={f.fournisseur} onChange={(e) => setF({ ...f, fournisseur: e.target.value })} placeholder="Total, Leroy Merlin…" /></div>
            <div><Label>Date *</Label><Input type="date" value={f.date_depense} onChange={(e) => setF({ ...f, date_depense: e.target.value })} /></div>
            <div><Label>Catégorie</Label>
              <Select value={f.categorie} onValueChange={(v) => setF({ ...f, categorie: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NDF_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Montant TTC (€) *</Label><Input inputMode="decimal" value={f.ttc} onChange={(e) => setF({ ...f, ttc: e.target.value, ...recalc(e.target.value, f.taux) })} /></div>
            <div><Label>Taux TVA</Label>
              <Select value={f.taux} onValueChange={(v) => setF({ ...f, taux: v, ...recalc(f.ttc, v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NDF_TAUX_TVA.map((t) => <SelectItem key={t} value={String(t)}>{String(t).replace(".", ",")} %</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Montant HT (€)</Label><Input inputMode="decimal" value={f.ht} onChange={(e) => setF({ ...f, ht: e.target.value })} /></div>
            <div><Label>TVA (€)</Label><Input inputMode="decimal" value={f.tva} onChange={(e) => setF({ ...f, tva: e.target.value })} /></div>
            <div className="sm:col-span-2 space-y-1">
              <div className="flex items-center justify-between"><Label>Chantier *</Label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">Saisie libre<Switch checked={f.libre} onCheckedChange={(v) => setF({ ...f, libre: v })} /></label>
              </div>
              {f.libre
                ? <Input value={f.chantier_libre} onChange={(e) => setF({ ...f, chantier_libre: e.target.value })} placeholder="Atelier, frais généraux…" />
                : <Select value={f.affaire_id} onValueChange={(v) => setF({ ...f, affaire_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choisir un chantier" /></SelectTrigger>
                    <SelectContent>{affaires.map((a) => <SelectItem key={a.id} value={a.id}>{a.numero ?? "—"} · {a.nom}</SelectItem>)}</SelectContent>
                  </Select>}
            </div>
            <div className="sm:col-span-2"><Label>Commentaire</Label><Textarea rows={2} value={f.commentaire} onChange={(e) => setF({ ...f, commentaire: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save} disabled={busy !== null}>{busy === "save" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{note ? "Enregistrer" : "Envoyer pour validation"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
