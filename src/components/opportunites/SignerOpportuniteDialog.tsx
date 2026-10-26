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
import { ResponsableCombobox } from "@/components/affaire/ResponsableCombobox";
import { canAssignDessinateur, signatureAffectations } from "@/lib/affaire-affectations";
import {
  prefixForTypologie,
  isValidManualAffaireCode,
  type TypologieFuture,
} from "@/lib/typologie-future";
import {
  AFFAIRE_TYPOLOGIE_LABELS,
} from "@/lib/affaire-typologie";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affaireId: string;
  /** Ancien code 9XXX, affiché à titre informatif. */
  oldCode: string;
  /** Client pour le titre de la modale. */
  clientLabel?: string | null;
  /** v0.29.2 — typologie future déclarée par le CA en amont. */
  typologieFuture?: TypologieFuture | null;
  onSigned: () => void;
}

interface LastUsedCode {
  code: string;
  client: string | null;
  signed_at: string | null;
  nom: string | null;
}

/**
 * v0.17 → v0.29.2 — Modale "Signer une opportunité gagnée".
 * Code choisi manuellement, indépendamment de la typologie déclarée.
 * Suggestions facultatives ; les codes 9XXX et les doublons sont refusés.
 */
export function SignerOpportuniteDialog({
  open,
  onOpenChange,
  affaireId,
  oldCode,
  clientLabel,
  typologieFuture,
  onSigned,
}: Props) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastCodes, setLastCodes] = useState<LastUsedCode[]>([]);
  const [suggestedCode, setSuggestedCode] = useState("");
  const [suggestedMontageCode, setSuggestedMontageCode] = useState("");
  const [chefProjetId, setChefProjetId] = useState<string | null>(null);
  const [dessinateurId, setDessinateurId] = useState<string | null>(null);
  const [loadingAffectations, setLoadingAffectations] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setChefProjetId(null);
    setDessinateurId(null);
    setLoadingAffectations(true);
    supabase.from("affaires").select("chef_projet_id, dessinateur_id").eq("id", affaireId).single().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { toast.error("Impossible de lire les affectations", { description: error.message }); return; }
      setChefProjetId(data.chef_projet_id);
      setDessinateurId(data.dessinateur_id);
      setLoadingAffectations(false);
    });
    return () => { cancelled = true; };
  }, [open, affaireId]);

  const typo: TypologieFuture | null = typologieFuture ?? null;
  const declaredPrefix = prefixForTypologie(typo);
  const prefix = /^[1-6]/.test(code) ? Number(code[0]) : declaredPrefix === 9 ? 6 : declaredPrefix;
  const formatOk = isValidManualAffaireCode(code);

  useEffect(() => {
    if (open) setCode("");
  }, [open, affaireId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSuggestedMontageCode("");
    supabase.rpc("next_affaire_numero", { _prefix: 4 }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        toast.error("Impossible de suggérer un code 4XXX", { description: error.message });
      } else if (data) {
        setSuggestedMontageCode(String(data));
      }
    });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLastCodes([]);
    setSuggestedCode("");
    setLoadingCode(true);
    Promise.all([
      supabase.rpc("next_affaire_numero", { _prefix: prefix }),
      supabase.rpc("get_last_used_codes", { _prefix: prefix, _n: 5 }),
    ]).then(([nextRes, lastRes]) => {
      if (cancelled) return;
      setLoadingCode(false);
      if (nextRes.error) {
        toast.error("Impossible de suggérer un code", {
          description: nextRes.error.message,
        });
      } else if (nextRes.data) {
        setSuggestedCode(String(nextRes.data));
      }
      if (!lastRes.error && Array.isArray(lastRes.data)) {
        setLastCodes(lastRes.data as LastUsedCode[]);
      }
    });
    return () => { cancelled = true; };
  }, [open, prefix]);

  async function handleSign() {
    const trimmed = code.trim();
    if (!isValidManualAffaireCode(trimmed)) {
      toast.error("Code invalide", {
        description: "Format attendu : 6XXX, 4XXX ou 2XXXX (anciens codes 1XXX, 3XXX et 5XXX acceptés).",
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("sign_opportunite", {
      _affaire_id: affaireId,
      _new_code: trimmed,
      ...signatureAffectations(chefProjetId, dessinateurId, trimmed),
    });
    setSaving(false);
    if (error) {
      toast.error("Signature impossible", { description: error.message });
      return;
    }
    toast.success(`Opportunité ${oldCode} signée → affaire ${trimmed}`);
    onSigned();
    onOpenChange(false);
    navigate({ to: "/affaires/$affaireId", params: { affaireId } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Signer l&apos;opportunité {oldCode}</DialogTitle>
          <DialogDescription>
            {clientLabel ? `Client : ${clientLabel}. ` : ""}
            Conversion d&apos;une opportunité gagnée en affaire signée. Le code 9XXX d&apos;origine
            est conservé pour le reporting de conversion.
          </DialogDescription>
        </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="signature-code-affaire">
                Nouveau code affaire
                {typo && (
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    Typologie : {AFFAIRE_TYPOLOGIE_LABELS[typo]}
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="signature-code-affaire"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="6XXX / 4XXX / 2XXXX"
                  className="font-mono"
                  maxLength={5}
                  inputMode="numeric"
                  autoFocus
                />
                {loadingCode && (
                  <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              {suggestedCode && (
                <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setCode(suggestedCode)}>
                  Utiliser le prochain code libre : {suggestedCode}
                </Button>
              )}
              {prefix !== 4 && suggestedMontageCode && (
                <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setCode(suggestedMontageCode)}>
                  Utiliser le prochain code libre : {suggestedMontageCode}
                </Button>
              )}
              {!formatOk && code.length > 0 && (
                <p className="text-[11px] text-destructive">
                  Format invalide : 6XXX, 4XXX ou 2XXXX.
                </p>
              )}
            </div>

            {lastCodes.length > 0 && (
              <div className="grid gap-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  5 derniers codes {prefix}XXX utilisés
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {lastCodes.map((c) => (
                    <Button
                      key={c.code}
                      variant="ghost"
                      size="sm"
                      disabled
                      className="group flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[11px] transition-colors hover:border-primary hover:bg-primary/10"
                      title={[c.client, c.nom].filter(Boolean).join(" — ") || "Affaire signée"}
                    >
                      <span className="font-mono font-semibold">{c.code}</span>
                      <span className="max-w-[120px] truncate text-muted-foreground">
                        {c.client ?? c.nom ?? "—"}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Chef de projet</Label>
              <ResponsableCombobox label="Chef de projet" value={chefProjetId} onChange={setChefProjetId} disabled={saving || loadingAffectations} />
            </div>
            {canAssignDessinateur(code) && <div className="space-y-1.5">
              <Label>Dessinateur</Label>
              <ResponsableCombobox label="Dessinateur" value={dessinateurId} onChange={setDessinateurId} disabled={saving || loadingAffectations} />
            </div>}

            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-mono font-semibold">{oldCode}</span>
              <ArrowRight className="mx-1.5 inline h-3 w-3 align-middle" />
              <span className="font-mono font-semibold text-foreground">
                {code || "—"}
              </span>{" "}
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
            disabled={saving || loadingAffectations || !formatOk}
            className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Signer et créer l&apos;affaire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
