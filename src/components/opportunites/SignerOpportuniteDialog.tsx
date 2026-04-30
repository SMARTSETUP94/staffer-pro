import { useEffect, useState } from "react";
import { Loader2, ArrowRight, AlertTriangle } from "lucide-react";
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
import {
  prefixForTypologie,
  codeLengthForTypologie,
  isValidCodeForTypologie,
  placeholderForTypologie,
  isSignableTypologie,
  codePrefixMismatch,
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
 * - Pré-remplit le code via next_affaire_numero(prefix) selon typologie_future.
 * - Affiche les 5 derniers codes utilisés du préfixe (cliquables pour copier).
 * - Validation regex format selon préfixe + warning souple si préfixe ≠ typologie déclarée.
 * - Bloque la signature pour typologie 'prototype' (reste en 9XXX).
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

  const typo: TypologieFuture | null = typologieFuture ?? null;
  const prefix = prefixForTypologie(typo);
  const codeLen = codeLengthForTypologie(typo);
  const placeholder = placeholderForTypologie(typo);
  const signable = isSignableTypologie(typo);
  const formatOk = code.length === 0 ? false : isValidCodeForTypologie(code, typo);
  const mismatch = codePrefixMismatch(code, typo);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setLastCodes([]);
    if (!signable) return;
    setLoadingCode(true);
    Promise.all([
      supabase.rpc("next_affaire_numero", { _prefix: prefix }),
      supabase.rpc("get_last_used_codes", { _prefix: prefix, _n: 5 }),
    ]).then(([nextRes, lastRes]) => {
      setLoadingCode(false);
      if (nextRes.error) {
        toast.error(`Impossible de suggérer un code ${placeholder}`, {
          description: nextRes.error.message,
        });
      } else if (nextRes.data) {
        setCode(String(nextRes.data));
      }
      if (!lastRes.error && Array.isArray(lastRes.data)) {
        setLastCodes(lastRes.data as LastUsedCode[]);
      }
    });
  }, [open, prefix, placeholder, signable]);

  async function handleSign() {
    const trimmed = code.trim();
    if (!isValidCodeForTypologie(trimmed, typo)) {
      toast.error("Code invalide", {
        description: `Format attendu : ${placeholder} (${codeLen} chiffres).`,
      });
      return;
    }
    if (mismatch) {
      // Soft warning : on autorise mais on prévient
      toast.warning("Préfixe différent de la typologie déclarée", {
        description: `Typologie : ${typo ? AFFAIRE_TYPOLOGIE_LABELS[typo] : "—"} → préfixe attendu ${prefix}.`,
      });
    }
    setSaving(true);
    const { error } = await supabase.rpc("sign_opportunite", {
      _affaire_id: affaireId,
      _new_code: trimmed,
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

        {!signable ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mr-1 inline h-3 w-3 align-middle" />
            Typologie <strong>Prototype</strong> : l&apos;opportunité reste en 9XXX et ne génère
            pas d&apos;affaire signée. Modifie la typologie cible avant de signer.
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>
                Nouveau code affaire ({placeholder})
                {typo && (
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    Typologie : {AFFAIRE_TYPOLOGIE_LABELS[typo]}
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder={placeholder}
                  className="font-mono"
                  maxLength={codeLen}
                  inputMode="numeric"
                  autoFocus
                />
                {loadingCode && (
                  <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Suggestion automatique du prochain code libre — éditable si besoin.
              </p>
              {mismatch && code.length > 0 && (
                <p className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  Préfixe ≠ typologie déclarée. Vérifie ou ajuste la typologie avant de signer.
                </p>
              )}
              {!formatOk && code.length > 0 && (
                <p className="text-[11px] text-destructive">
                  Format invalide : attendu {placeholder} ({codeLen} chiffres).
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
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setCode(c.code)}
                      className="group flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[11px] transition-colors hover:border-primary hover:bg-primary/10"
                      title={[c.client, c.nom].filter(Boolean).join(" — ") || "Affaire signée"}
                    >
                      <span className="font-mono font-semibold">{c.code}</span>
                      <span className="max-w-[120px] truncate text-muted-foreground">
                        {c.client ?? c.nom ?? "—"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-mono font-semibold">{oldCode}</span>
              <ArrowRight className="mx-1.5 inline h-3 w-3 align-middle" />
              <span className="font-mono font-semibold text-foreground">
                {code || placeholder}
              </span>{" "}
              — phase passe en <span className="font-semibold">signée</span>, statut{" "}
              <span className="font-semibold">en cours</span>.
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">
            Annuler
          </Button>
          <Button
            onClick={handleSign}
            disabled={!signable || saving || loadingCode || !formatOk}
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
