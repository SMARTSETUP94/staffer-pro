import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, FolderPlus, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AffaireCombobox } from "@/components/planning/AffaireCombobox";
import { useAffairesPourLogistique } from "@/hooks/use-etapes-logistiques";
import { saveEmailDocument } from "@/lib/server-fns/save-email-document.functions";
import { isDocumentAffaireCode } from "@/lib/affaire-document-rules";
import type { EmailAttachment } from "@/lib/server-fns/shared-inbox-attachments.functions";

type AttachmentOutcome = { name: string; status: "ok" | "already" | "error"; message?: string };

export function SaveEmailDocumentDialog({ emailId, attachments, onClose, initialAffaireId }: { emailId: string; attachments: EmailAttachment[]; onClose: () => void; initialAffaireId?: string }) {
  const { data: affaires = [], isLoading, error } = useAffairesPourLogistique();
  const [affaireId, setAffaireId] = useState(initialAffaireId ?? "");
  const [saving, setSaving] = useState(false);
  const [outcomes, setOutcomes] = useState<AttachmentOutcome[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const save = useServerFn(saveEmailDocument);

  async function submit() {
    setSaving(true);
    setSaveError(null);
    const results: AttachmentOutcome[] = [];
    for (const a of attachments) {
      try {
        const result = await save({ data: { emailId, attachmentId: a.id, affaireId } });
        results.push({ name: a.name, status: result.alreadySaved ? "already" : "ok" });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Enregistrement impossible";
        results.push({ name: a.name, status: "error", message });
      }
      setOutcomes([...results]);
    }
    await queryClient.invalidateQueries({ queryKey: ["documents-affaires"] });
    const ok = results.filter((r) => r.status !== "error").length;
    const failed = results.filter((r) => r.status === "error");
    if (ok > 0) toast.success(`${ok} pièce${ok > 1 ? "s" : ""} classée${ok > 1 ? "s" : ""} dans l'affaire`);
    if (failed.length > 0) toast.error(`${failed.length} pièce${failed.length > 1 ? "s" : ""} en échec`);
    if (failed.length > 0) setSaveError(failed.map((f) => `${f.name} : ${f.message ?? "erreur"}`).join(" · "));
    setSaving(false);
  }

  const savedCount = outcomes?.filter((o) => o.status !== "error").length ?? 0;
  const hasError = outcomes?.some((o) => o.status === "error") ?? false;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enregistrer {attachments.length > 1 ? `les ${attachments.length} pièces jointes` : "la pièce jointe"} dans une affaire</DialogTitle>
          <DialogDescription className="break-all">{attachments.map((a) => a.name).join(", ")}</DialogDescription>
        </DialogHeader>
        {error ? <p className="text-destructive text-sm">Liste des affaires indisponible.</p> : isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> :
          <AffaireCombobox affaires={affaires.filter((a) => isDocumentAffaireCode(a.numero))} value={affaireId} onChange={(id) => { setAffaireId(id); setOutcomes(null); }} includeOpportunites includeClosed placeholder="N°, chantier, client ou lieu…" />}
        {outcomes && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-2 text-xs" data-testid="classement-outcomes">
            {outcomes.map((o) => (
              <li key={o.name} className="flex items-center justify-between gap-2">
                <span className="truncate">{o.name}</span>
                {o.status === "ok" && <span className="flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> enregistrée</span>}
                {o.status === "already" && <span className="text-muted-foreground">déjà classée</span>}
                {o.status === "error" && <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> échec</span>}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Fermer</Button>
          {outcomes && savedCount > 0 && !hasError ? (
            <Button asChild><Link to="/affaires/$affaireId/documents" params={{ affaireId }} onClick={onClose}>Voir les documents</Link></Button>
          ) : (
            <Button onClick={submit} disabled={!affaireId || saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement…</> : <FolderPlus className="mr-2 h-4 w-4" />}Enregistrer</Button>
          )}
        </DialogFooter>
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      </DialogContent>
    </Dialog>
  );
}
