import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  getAffaireTypologie,
  AFFAIRE_TYPOLOGIE_LABELS,
} from "@/lib/affaire-typologie";

/** Formats acceptés côté DB (CHECK affaires_numero_format). */
const NUMERO_RE = /^(\d{4,5}|\d{4}-\d{3}|[A-Z]{3,}[A-Z0-9-]*)$/;

interface Props {
  affaireId: string;
  numero: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * LOT 0 — Édition du numéro d'une affaire existante.
 * La typologie est une colonne générée : elle est recalculée automatiquement,
 * on avertit donc l'utilisateur si le changement la modifie.
 */
export function EditNumeroAffaireDialog({ affaireId, numero, open, onOpenChange, onSaved }: Props) {
  const [value, setValue] = useState(numero);
  const [saving, setSaving] = useState(false);

  const trimmed = value.trim().toUpperCase();
  const formatOk = NUMERO_RE.test(trimmed);
  const currentTypo = getAffaireTypologie(numero);
  const nextTypo = getAffaireTypologie(trimmed);
  const typoChange = formatOk && trimmed !== numero && currentTypo !== nextTypo;

  async function handleSave() {
    if (!formatOk) {
      toast.error("Format invalide", { description: "Attendu : 4 ou 5 chiffres (ex. 6042, 20014)." });
      return;
    }
    if (trimmed === numero) {
      onOpenChange(false);
      return;
    }
    setSaving(true);

    const { data: existing } = await supabase
      .from("affaires")
      .select("id")
      .eq("numero", trimmed)
      .maybeSingle();
    if (existing) {
      setSaving(false);
      toast.error("Numéro déjà utilisé", { description: `L'affaire ${trimmed} existe déjà.` });
      return;
    }

    const { error } = await supabase.from("affaires").update({ numero: trimmed }).eq("id", affaireId);
    setSaving(false);
    if (error) {
      toast.error("Modification impossible", { description: error.message });
      return;
    }
    toast.success(`Numéro modifié : ${numero} → ${trimmed}`);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setValue(numero);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le numéro d'affaire</DialogTitle>
          <DialogDescription>
            Le numéro doit rester unique. La typologie du chantier est recalculée automatiquement à
            partir du numéro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="numero-affaire">Numéro</Label>
            <Input
              id="numero-affaire"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="ex. 6042"
              className={!formatOk ? "border-destructive" : ""}
              autoFocus
            />
            {!formatOk && (
              <p className="text-xs text-destructive">
                Format attendu : 4 ou 5 chiffres (ex. 6042, 20014).
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Typologie actuelle :{" "}
            <span className="font-medium text-foreground">
              {currentTypo ? AFFAIRE_TYPOLOGIE_LABELS[currentTypo] : "non déterminée"}
            </span>
          </p>

          {typoChange && (
            <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <p>
                Ce changement modifie la typologie du chantier :{" "}
                <strong>{currentTypo ? AFFAIRE_TYPOLOGIE_LABELS[currentTypo] : "non déterminée"}</strong>{" "}
                → <strong>{nextTypo ? AFFAIRE_TYPOLOGIE_LABELS[nextTypo] : "non déterminée"}</strong>. Les
                vues et filtres par typologie seront impactés.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button className="rounded-xl" onClick={handleSave} disabled={saving || !formatOk}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
