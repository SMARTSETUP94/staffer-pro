import { useEffect, useState } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affaireId: string;
  /** Ancien code 9XXX, affiché à titre informatif. */
  oldCode: string;
  /** Client pour le titre de la modale. */
  clientLabel?: string | null;
  onSigned: () => void;
}

/**
 * v0.17 — Modale "Signer une opportunité gagnée" : suggère un code 5XXX
 * (next_affaire_numero) et appelle la RPC `sign_opportunite`. Sur succès,
 * redirige vers la fiche affaire 5XXX nouvellement créée.
 */
export function SignerOpportuniteDialog({
  open,
  onOpenChange,
  affaireId,
  oldCode,
  clientLabel,
  onSigned,
}: Props) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setLoadingCode(true);
    supabase.rpc("next_affaire_numero", { _prefix: 5 }).then(({ data, error }) => {
      setLoadingCode(false);
      if (error) {
        toast.error("Impossible de suggérer un code 5XXX", { description: error.message });
        return;
      }
      if (data) setCode(String(data));
    });
  }, [open]);

  async function handleSign() {
    if (!code.match(/^5\d{3}$/)) {
      toast.error("Code invalide", { description: "Format attendu : 5XXX (4 chiffres)." });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("sign_opportunite", {
      _affaire_id: affaireId,
      _new_code: code.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error("Signature impossible", { description: error.message });
      return;
    }
    toast.success(`Opportunité ${oldCode} signée → affaire ${code}`);
    onSigned();
    onOpenChange(false);
    // Redirige vers la fiche affaire (le numéro changé, l'id reste le même)
    navigate({ to: "/affaires/$affaireId", params: { affaireId } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Signer l'opportunité {oldCode}</DialogTitle>
          <DialogDescription>
            {clientLabel ? `Client : ${clientLabel}. ` : ""}
            Conversion d'une opportunité gagnée en affaire signée. Le code 9XXX d'origine
            est conservé pour le reporting de conversion.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nouveau code affaire (5XXX)</Label>
            <div className="relative">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="5000"
                className="font-mono"
                maxLength={4}
                autoFocus
              />
              {loadingCode && (
                <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Suggestion automatique du prochain code libre — éditable si besoin.
            </p>
          </div>

          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-mono font-semibold">{oldCode}</span>
            <ArrowRight className="mx-1.5 inline h-3 w-3 align-middle" />
            <span className="font-mono font-semibold text-foreground">{code || "5XXX"}</span>{" "}
            — phase passe en <span className="font-semibold">signée</span>, statut{" "}
            <span className="font-semibold">en cours</span>.
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Annuler
          </Button>
          <Button
            onClick={handleSign}
            disabled={saving || loadingCode}
            className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Signer et créer l'affaire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
