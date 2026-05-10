/**
 * Tour 2 — Dialog de signature contrat (employé OU employeur).
 * Charge le PDF courant + canvas signature + bouton Signer.
 */
import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { SignatureCanvas, type SignatureCanvasHandle } from "./SignatureCanvas";
import { signContratAsEmploye, signContratAsEmployeur } from "@/lib/contrats-signature";
import { openContratPdf } from "@/lib/contrats-pdf-proxy";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contratId: string;
  role: "employe" | "employeur";
  pdfUrl?: string | null;
  onSigned?: () => void;
}

export function SignContractDialog({ open, onOpenChange, contratId, role, pdfUrl, onSigned }: Props) {
  const sigRef = useRef<SignatureCanvasHandle>(null);
  const [submitting, setSubmitting] = useState(false);
  const [empty, setEmpty] = useState(true);

  const handleSign = async () => {
    console.log("[contrat-signature][dialog.submitClick]", { contratId, role, empty, submitting, hasCanvasRef: !!sigRef.current });
    const dataUrl = sigRef.current?.getDataUrl();
    console.log("[contrat-signature][dialog.signatureState]", { hasDataUrl: !!dataUrl, length: dataUrl?.length ?? 0, empty });
    if (!dataUrl) {
      console.warn("[contrat-signature][dialog.blocked:no-signature]", { contratId, role, empty });
      toast.error("Signature requise");
      return;
    }
    setSubmitting(true);
    console.log("[contrat-signature][dialog.submitting:start]", { contratId, role });
    try {
      if (role === "employe") {
        console.log("[contrat-signature][dialog.preRpc:employe]", { contratId });
        await signContratAsEmploye(contratId, dataUrl);
      } else {
        console.log("[contrat-signature][dialog.preRpc:employeur]", { contratId });
        await signContratAsEmployeur(contratId, dataUrl);
      }
      console.log("[contrat-signature][dialog.rpc:success]", { contratId, role });
      toast.success(role === "employe" ? "Contrat signé — en attente de l'employeur" : "Contrat finalisé");
      console.log("[contrat-signature][dialog.onSigned]");
      onSigned?.();
      console.log("[contrat-signature][dialog.close:after-success]");
      onOpenChange(false);
    } catch (e) {
      console.error("[contrat-signature][dialog.rpc:error]", e);
      toast.error(e instanceof Error ? e.message : "Erreur lors de la signature");
    } finally {
      console.log("[contrat-signature][dialog.submitting:stop]", { contratId, role });
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => {
      console.log("[contrat-signature][dialog.onOpenChange]", { value, submitting, contratId, role });
      onOpenChange(value);
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {role === "employe" ? "Signer mon contrat intermittent" : "Contre-signer le contrat"}
          </DialogTitle>
          <DialogDescription>
            En signant ci-dessous, vous donnez votre consentement au sens de l'article 1367 du Code Civil.
            Un horodatage et un hash cryptographique sont enregistrés.
          </DialogDescription>
        </DialogHeader>

        {pdfUrl && (
          <div className="rounded-md border bg-muted/30 p-3 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4" />Contrat à signer</span>
            <Button variant="outline" size="sm" onClick={() => openContratPdf(contratId).catch((e) => toast.error(e instanceof Error ? e.message : "PDF indisponible"))}>
              <Download className="h-3.5 w-3.5" />Lire le PDF
            </Button>
          </div>
        )}

        <SignatureCanvas ref={sigRef} onChange={(isEmpty) => {
          console.log("[contrat-signature][dialog.canvasChange]", { isEmpty, contratId, role });
          setEmpty(isEmpty);
        }} />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Annuler</Button>
          <Button onClick={handleSign} disabled={submitting || empty}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {role === "employe" ? "Signer" : "Contre-signer & finaliser"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
