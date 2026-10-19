import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, Download, Eye, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NDF_STATUTS, categorieLabel, formatEur } from "@/lib/notes-frais";
import { NDF_SELECT, type NoteAvecChantier } from "./_app.mes-notes-de-frais";

export const Route = createFileRoute("/_app/validation-notes-de-frais")({
  beforeLoad: () => requireCapability("section.admin"),
  head: () => ({
    meta: [
      { title: "Validation des notes de frais — Setup Paris" },
      { name: "description", content: "La direction valide, rejette et marque comme remboursées les notes de frais des collaborateurs." },
      { property: "og:title", content: "Validation des notes de frais — Setup Paris" },
      { property: "og:description", content: "Revue des notes de frais avec justificatif." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ValidationNotesDeFrais,
});

function ValidationNotesDeFrais() {
  const qc = useQueryClient();
  const [statut, setStatut] = useState("en_attente");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<NoteAvecChantier | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [motif, setMotif] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["ndf-validation", statut],
    queryFn: async () => {
      let req = supabase.from("notes_de_frais").select(NDF_SELECT).order("date_depense", { ascending: false }).limit(1000);
      if (statut !== "tous") req = req.eq("statut", statut as never);
      const { data, error } = await req;
      if (error) throw error;
      return (data ?? []) as unknown as NoteAvecChantier[];
    },
  });
  const userIds = useMemo(() => [...new Set(rows.map((r) => r.user_id))], [rows]);
  const { data: noms = new Map<string, string>() } = useQuery({
    queryKey: ["ndf-noms", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name,email").in("id", userIds);
      return new Map((data ?? []).map((p) => [p.id, p.full_name || p.email]));
    },
  });
  const chantier = (r: NoteAvecChantier) => r.affaires ? `${r.affaires.numero ?? ""} ${r.affaires.nom}`.trim() : r.chantier_libre ?? "";
  const filtered = rows.filter((r) => !q || `${noms.get(r.user_id) ?? ""} ${r.fournisseur} ${chantier(r)}`.toLowerCase().includes(q.toLowerCase()));

  async function ouvrir(r: NoteAvecChantier) {
    setSel(r); setMotif(""); setUrl(null);
    if (r.justificatif_path) {
      const { data } = await supabase.storage.from("notes-de-frais").createSignedUrl(r.justificatif_path, 600);
      setUrl(data?.signedUrl ?? null);
    }
  }
  async function setStatus(r: NoteAvecChantier, s: "validee" | "rejetee" | "remboursee") {
    if (s === "rejetee" && !motif.trim()) return toast.error("Indique le motif du rejet");
    const { error } = await supabase.from("notes_de_frais").update({ statut: s, motif_rejet: s === "rejetee" ? motif.trim() : null }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(NDF_STATUTS[s].label);
    setSel(null);
    qc.invalidateQueries({ queryKey: ["ndf-validation"] });
  }
  function exportCsv() {
    const head = ["Date", "Collaborateur", "Fournisseur", "Catégorie", "Chantier", "HT", "TVA", "Taux TVA", "TTC", "Statut", "Commentaire"];
    const lines = filtered.map((r) => [r.date_depense, noms.get(r.user_id) ?? "", r.fournisseur, categorieLabel(r.categorie), chantier(r),
      r.montant_ht, r.montant_tva, r.taux_tva, r.montant_ttc, NDF_STATUTS[r.statut]?.label ?? r.statut, r.commentaire ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    const blob = new Blob(["\ufeff" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `notes-de-frais-${statut}.csv`; a.click();
  }
  const total = filtered.reduce((a, r) => a + Number(r.montant_ttc), 0);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Validation des notes de frais" description="Vérifie chaque justificatif, puis valide, rejette ou marque comme remboursée." />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statut} onValueChange={setStatut}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(NDF_STATUTS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            <SelectItem value="tous">Toutes</SelectItem>
          </SelectContent>
        </Select>
        <Input className="w-64" placeholder="Collaborateur, fournisseur, chantier…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-sm text-muted-foreground">{filtered.length} note(s) · {formatEur(total)} TTC</span>
        <Button variant="outline" className="ml-auto" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />Export CSV</Button>
      </div>
      <div className="divide-y rounded-md border">
        {filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Aucune note de frais.</p>}
        {filtered.map((r) => (
          <button key={r.id} onClick={() => ouvrir(r)} className="flex w-full flex-wrap items-center gap-3 p-3 text-left text-sm hover:bg-muted/50">
            <div className="w-20 text-muted-foreground">{format(parseISO(r.date_depense), "d MMM yy", { locale: fr })}</div>
            <div className="w-40 font-medium">{noms.get(r.user_id) ?? "…"}</div>
            <div className="min-w-0 flex-1"><div>{r.fournisseur}</div><div className="text-xs text-muted-foreground">{categorieLabel(r.categorie)} · {chantier(r)}</div></div>
            <div className="text-right"><div className="font-semibold">{formatEur(r.montant_ttc)}</div><div className="text-xs text-muted-foreground">HT {formatEur(r.montant_ht)}</div></div>
            <Badge variant={NDF_STATUTS[r.statut]?.variant}>{NDF_STATUTS[r.statut]?.label}</Badge>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-5xl">
          {sel && <>
            <DialogHeader><DialogTitle>{sel.fournisseur} — {noms.get(sel.user_id)}</DialogTitle></DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
                {!sel.justificatif_path ? <span className="text-sm text-muted-foreground">Aucun justificatif</span>
                  : !url ? <span className="text-sm text-muted-foreground">Chargement…</span>
                  : sel.justificatif_path.toLowerCase().endsWith(".pdf") ? <iframe src={url} title="Justificatif" className="h-[70vh] w-full" />
                  : <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="Justificatif" className="max-h-[70vh] object-contain" /></a>}
              </div>
              <div className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Date :</span> {format(parseISO(sel.date_depense), "EEEE d MMMM yyyy", { locale: fr })}</p>
                <p><span className="text-muted-foreground">Catégorie :</span> {categorieLabel(sel.categorie)}</p>
                <p><span className="text-muted-foreground">Chantier :</span> {chantier(sel)}</p>
                <p><span className="text-muted-foreground">HT :</span> {formatEur(sel.montant_ht)} · <span className="text-muted-foreground">TVA {String(sel.taux_tva).replace(".", ",")} % :</span> {formatEur(sel.montant_tva)}</p>
                <p className="text-lg font-semibold">TTC {formatEur(sel.montant_ttc)}</p>
                {sel.commentaire && <p className="rounded bg-muted p-2">{sel.commentaire}</p>}
                <Badge variant={NDF_STATUTS[sel.statut]?.variant}>{NDF_STATUTS[sel.statut]?.label}</Badge>
                <div className="space-y-2 border-t pt-3">
                  {sel.statut !== "validee" && sel.statut !== "remboursee" && <Button className="w-full" onClick={() => setStatus(sel, "validee")}><Check className="mr-1 h-4 w-4" />Valider</Button>}
                  {sel.statut === "validee" && <Button className="w-full" onClick={() => setStatus(sel, "remboursee")}><Wallet className="mr-1 h-4 w-4" />Marquer comme remboursée</Button>}
                  {sel.statut !== "remboursee" && <>
                    <Textarea rows={2} placeholder="Motif du rejet (envoyé au collaborateur)" value={motif} onChange={(e) => setMotif(e.target.value)} />
                    <Button variant="destructive" className="w-full" onClick={() => setStatus(sel, "rejetee")}><X className="mr-1 h-4 w-4" />Rejeter</Button>
                  </>}
                </div>
              </div>
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
