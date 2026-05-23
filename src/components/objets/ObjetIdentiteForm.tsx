/**
 * Lot 8.2 — Formulaire d'identité réutilisable d'un objet de fabrication.
 *
 * Surface :
 *   - Mode "read" : affiche les valeurs en disabled.
 *   - Mode "edit" : champs activables selon `allowedFields`.
 *
 * Conçu pour être réutilisé par ObjetIdentiteSection (fiche objet) et,
 * à terme, par EditerObjetDialog (refacto déféré — voir mem://features/fiche-objet).
 */
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ObjetEditableField } from "@/lib/objet-fiche-permissions";
import {
  FAB_METIERS,
  FAB_METIER_LABELS,
  type FabMetier,
} from "@/hooks/use-fabrication";

export interface ObjetIdentiteValues {
  nom: string;
  quantite: number;
  commentaire: string | null;
  respo_fab_id: string | null;
  heures_prevues_be: number;
  heures_prevues_numerique: number;
  heures_prevues_bois: number;
  heures_prevues_metal: number;
  heures_prevues_peinture: number;
  heures_prevues_tapisserie: number;
  heures_prevues_manutention: number;
}

const METIER_TO_COL: Record<FabMetier, keyof ObjetIdentiteValues> = {
  be: "heures_prevues_be",
  numerique: "heures_prevues_numerique",
  bois: "heures_prevues_bois",
  metal: "heures_prevues_metal",
  peinture: "heures_prevues_peinture",
  tapisserie: "heures_prevues_tapisserie",
  manutention: "heures_prevues_manutention",
};

interface Props {
  reference: string;
  initial: ObjetIdentiteValues;
  mode: "read" | "edit";
  allowedFields: Set<ObjetEditableField>;
  respoOptions: Array<{ id: string; label: string }>;
  onChange?: (next: ObjetIdentiteValues) => void;
}

export function ObjetIdentiteForm({
  reference,
  initial,
  mode,
  allowedFields,
  respoOptions,
  onChange,
}: Props) {
  const [values, setValues] = useState<ObjetIdentiteValues>(initial);

  useEffect(() => {
    setValues(initial);
  }, [initial]);

  const isReadOnly = mode === "read";
  const can = (f: ObjetEditableField) => !isReadOnly && allowedFields.has(f);

  const update = <K extends keyof ObjetIdentiteValues>(k: K, v: ObjetIdentiteValues[K]) => {
    const next = { ...values, [k]: v };
    setValues(next);
    onChange?.(next);
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Référence</Label>
        <div className="font-mono text-sm">{reference}</div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="fo-nom">Nom de l'objet</Label>
        <Input
          id="fo-nom"
          value={values.nom}
          disabled={!can("nom")}
          onChange={(e) => update("nom", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="fo-qte">Quantité</Label>
          <Input
            id="fo-qte"
            type="number"
            min={1}
            value={values.quantite}
            disabled={!can("quantite")}
            onChange={(e) =>
              update("quantite", Math.max(1, parseInt(e.target.value || "1", 10)))
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fo-respo">Responsable fab</Label>
          <Select
            value={values.respo_fab_id ?? "none"}
            disabled={!can("respo_fab_id")}
            onValueChange={(v) => update("respo_fab_id", v === "none" ? null : v)}
          >
            <SelectTrigger id="fo-respo">
              <SelectValue placeholder="— Non assigné —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Non assigné —</SelectItem>
              {respoOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="fo-comm">Commentaire / Notes internes</Label>
        <Textarea
          id="fo-comm"
          rows={3}
          value={values.commentaire ?? ""}
          disabled={!can("commentaire")}
          onChange={(e) => update("commentaire", e.target.value || null)}
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <Label className="mb-2 block text-xs font-medium uppercase text-muted-foreground">
          Heures prévues (devis) — par métier
        </Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FAB_METIERS.map((m) => {
            const col = METIER_TO_COL[m];
            return (
              <div key={m} className="grid gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor={`fo-h-${m}`}>
                  {FAB_METIER_LABELS[m]}
                </Label>
                <Input
                  id={`fo-h-${m}`}
                  type="number"
                  step="0.5"
                  min={0}
                  className="h-8 text-sm"
                  value={values[col] as number}
                  disabled={!can("heures_prevues")}
                  onChange={(e) =>
                    update(col, Math.max(0, parseFloat(e.target.value || "0")) as number)
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
        <span className="font-medium">Plans CAD</span> — à venir (sera édité par le BE).
      </div>
    </div>
  );
}
