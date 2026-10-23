import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AffaireCombobox } from "@/components/planning/AffaireCombobox";
import { useAffairesPourLogistique } from "@/hooks/use-etapes-logistiques";
import { saveEmailDocument } from "@/lib/server-fns/save-email-document.functions";
import { isDocumentAffaireCode } from "@/lib/affaire-document-rules";
import type { EmailAttachment } from "@/lib/server-fns/shared-inbox-attachments.functions";

export function SaveEmailDocumentDialog({ emailId, attachment, onClose }: { emailId: string; attachment: EmailAttachment; onClose: () => void }) {
  const { data: affaires = [], isLoading, error } = useAffairesPourLogistique();
  const [affaireId, setAffaireId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = useServerFn(saveEmailDocument);
  async function submit() {
    setSaving(true);
    try {
      const result = await save({ data: { emailId, attachmentId: attachment.id, affaireId } });
      toast.success(result.alreadySaved ? `Déjà enregistré dans l'affaire ${result.numero}` : `Document enregistré dans l'affaire ${result.numero}`);
      setSaved(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Enregistrement impossible"); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>Enregistrer dans une affaire</DialogTitle><DialogDescription className="break-all">{attachment.name}</DialogDescription></DialogHeader>
      {error ? <p className="text-destructive text-sm">Liste des affaires indisponible.</p> : isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> :
        <AffaireCombobox affaires={affaires.filter((a) => isDocumentAffaireCode(a.numero))} value={affaireId} onChange={(id) => { setAffaireId(id); setSaved(false); }} includeOpportunites includeClosed placeholder="N°, chantier, client ou lieu…" />}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Fermer</Button>
        {saved ? <Button asChild><Link to="/affaires/$affaireId/documents" params={{ affaireId }} onClick={onClose}>Voir les documents</Link></Button> :
          <Button onClick={submit} disabled={!affaireId || saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderPlus className="mr-2 h-4 w-4" />}Enregistrer</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}