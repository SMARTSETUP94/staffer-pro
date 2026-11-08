import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BUCKET_EXPORTS, exporterDevisPdf, lireDevisClient } from "@/lib/devis/pdf-export";
import type { NiveauPdf } from "@/lib/devis/pdf-client";
import { PdfAvertissements } from "./PdfAvertissements";

type ExportRow = { id: string; version: number; niveau: NiveauPdf; filigrane: boolean; storage_path: string; cree_le: string; auteur: string | null };

function telecharger(bytes: Uint8Array, nom: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a"); a.href = url; a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function ouvrirExport(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET_EXPORTS).createSignedUrl(path, 600);
  if (error || !data) { toast.error("Lien de téléchargement indisponible"); return; }
  window.open(data.signedUrl, "_blank", "noopener");
}

/** Export PDF client (détaillé ou synthétique) et historique des exports du devis. */
export function ExportPdfDialog({ devisId, open, onOpenChange }: { devisId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [niveau, setNiveau] = useState<NiveauPdf>("detaille");
  const [busy, setBusy] = useState(false);
  const hist = useQuery({
    queryKey: ["devis-exports", devisId], enabled: open,
    queryFn: async () => ((await supabase.rpc("devis_exports_lister", { _devis_id: devisId })).data ?? []) as unknown as ExportRow[],
  });
  const generer = async () => {
    setBusy(true);
    try {
      const r = await exporterDevisPdf(supabase, devisId, niveau);
      telecharger(r.bytes, r.nom);
      toast.success(r.export.filigrane ? "PDF généré avec le filigrane « PROJET »" : "PDF généré");
      if (r.avertissements.length) toast.warning(`Fiche client incomplète : ${r.avertissements.join(", ")}. Complétez-la avant l'envoi au client.`);
      void hist.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export impossible"); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Exporter en PDF</DialogTitle>
          <DialogDescription>Document client : ni heures, ni taux, ni coûts, ni marge. Un devis non validé porte le filigrane « PROJET ».</DialogDescription>
        </DialogHeader>
        <PdfAvertissements devisId={devisId} open={open} />
        <RadioGroup value={niveau} onValueChange={(v) => setNiveau(v as NiveauPdf)} className="gap-2">
          <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="detaille" />Détaillé — prix par objet, descriptifs et visuels</Label>
          <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="synthetique" />Synthétique — total par zone et chapitre</Label>
        </RadioGroup>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Historique des exports</p>
          {(hist.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Aucun export pour l'instant.</p>}
          <ul className="max-h-48 space-y-1 overflow-auto text-sm">
            {(hist.data ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                <span>{new Date(e.cree_le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · R{e.version} · {e.niveau === "detaille" ? "détaillé" : "synthétique"}{e.filigrane ? " · PROJET" : ""} · {e.auteur ?? "—"}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Télécharger cet export" onClick={() => void ouvrirExport(e.storage_path)}><Download className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter><Button disabled={busy} onClick={() => void generer()}><FileText className="mr-1 h-4 w-4" />{busy ? "Génération…" : "Générer et télécharger"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Envoi au client. Aucun expéditeur n'est configuré pour l'application : l'utilisateur télécharge le PDF,
 * ouvre sa messagerie pré-remplie, puis confirme l'envoi (date d'envoi + action « devis envoyé », comme « Marquer envoyé »).
 */
export function EnvoiEmailDialog({ devisId, open, onOpenChange, onSent }: { devisId: string; open: boolean; onOpenChange: (o: boolean) => void; onSent?: () => void }) {
  const [to, setTo] = useState(""); const [sujet, setSujet] = useState(""); const [msg, setMsg] = useState("");
  const [pdf, setPdf] = useState<{ path: string; nom: string } | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPdf(null);
    void lireDevisClient(supabase, devisId).then((vc) => {
      setTo(vc.contact?.email ?? "");
      setSujet(`Devis ${vc.numero}${vc.libelle ? ` — ${vc.libelle}` : ""}`);
      setMsg(`Bonjour${vc.contact?.nom ? ` ${vc.contact.nom}` : ""},\n\nVeuillez trouver ci-joint notre devis ${vc.numero}${vc.libelle ? ` pour « ${vc.libelle} »` : ""}.\nNous restons à votre disposition pour toute question ou ajustement.\n\nBien cordialement,\nL'équipe Set Up Paris`);
    }).catch(() => toast.error("Devis illisible"));
  }, [open, devisId]);

  const genererPdf = async () => {
    setBusy(true);
    try { const r = await exporterDevisPdf(supabase, devisId, "detaille"); telecharger(r.bytes, r.nom); setPdf({ path: r.path, nom: r.nom }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Export impossible"); } finally { setBusy(false); }
  };
  const messagerie = () => {
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(msg + `\n\n(Pièce jointe : ${pdf?.nom ?? "devis PDF"})`)}`;
  };
  const confirmer = async () => {
    const { error } = await supabase.rpc("devis_marquer_envoye", { _devis_id: devisId, _date: new Date().toISOString().slice(0, 10) });
    if (error) { toast.error(error.message); return; }
    toast.success("Devis marqué envoyé"); window.dispatchEvent(new Event("affaire-updated")); onSent?.(); onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Envoyer par email</DialogTitle>
          <DialogDescription>L'envoi automatique depuis l'application n'est pas encore configuré : téléchargez le PDF, ouvrez votre messagerie avec ce message, joignez le PDF puis confirmez l'envoi.</DialogDescription>
        </DialogHeader>
        <PdfAvertissements devisId={devisId} open={open} />
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="env-to">Destinataire</Label><Input id="env-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="contact@client.fr" /></div>
          <div className="space-y-1"><Label htmlFor="env-sujet">Objet</Label><Input id="env-sujet" value={sujet} onChange={(e) => setSujet(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="env-msg">Message</Label><Textarea id="env-msg" rows={8} value={msg} onChange={(e) => setMsg(e.target.value)} /></div>
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void genererPdf()}><Download className="mr-1 h-4 w-4" />{pdf ? "PDF téléchargé" : busy ? "Génération…" : "1. Télécharger le PDF"}</Button>
            <Button variant="outline" disabled={!to.trim()} onClick={messagerie}><Mail className="mr-1 h-4 w-4" />2. Ouvrir ma messagerie</Button>
          </div>
          <Button disabled={!pdf} onClick={() => void confirmer()}>3. J'ai envoyé le devis</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
