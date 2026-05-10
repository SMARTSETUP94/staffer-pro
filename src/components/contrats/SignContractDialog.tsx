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
    const dataUrl = sigRef.current?.getDataUrl();
    if (!dataUrl) {
      toast.error("Signature requise");
      return;
    }
    setSubmitting(true);
    try {
      if (role === "employe") {
        await signContratAsEmploye(contratId, dataUrl);
      } else {
        await signContratAsEmployeur(contratId, dataUrl);
      }
      toast.success(role === "employe" ? "Contrat signé — en attente de l'employeur" : "Contrat finalisé");
      onSigned?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la signature");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Button variant="outline" size="sm" asChild>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"><Download className="h-3.5 w-3.5" />Lire le PDF</a>
            </Button>
          </div>
        )}

        <SignatureCanvas ref={sigRef} onChange={setEmpty} />

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
