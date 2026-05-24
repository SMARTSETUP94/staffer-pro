/**
 * Lot 8.2 / 8.2c — Formulaire d'identité réutilisable d'un objet de fabrication.
 *
 * Surface :
 *   - Mode "read" : affiche les valeurs en disabled.
 *   - Mode "edit" : champs activables selon `allowedFields`.
 *
 * Lot 8.2c :
 *   - SUPPRIMÉ : bloc "Heures prévues (devis) — par métier" (source unique = ObjetHeuresTable).
 *   - AJOUTÉ  : Dimensions (L × l × h en mm), Matériaux (textarea), Finition détaillée (input).
 *
 * Note : les champs `heures_prevues_*` restent dans `ObjetIdentiteValues` car ils sont
 * utilisés ailleurs (import devis, recap, staffing) — on ne supprime QUE l'affichage.
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

export interface ObjetIdentiteValues {
  nom: string;
  quantite: number;
  commentaire: string | null;
  respo_fab_id: string | null;
  // Conservés pour les autres surfaces (import, recap, staffing) — non éditables ici.
  heures_prevues_be: number;
  heures_prevues_numerique: number;
  heures_prevues_bois: number;
  heures_prevues_metal: number;
  heures_prevues_peinture: number;
  heures_prevues_tapisserie: number;
  heures_prevues_manutention: number;
  // Lot 8.2c
  largeur_mm: number | null;
  longueur_mm: number | null;
  hauteur_mm: number | null;
  materiaux: string | null;
  finition_detail: string | null;
}

interface Props {
  reference: string;
  initial: ObjetIdentiteValues;
  mode: "read" | "edit";
  allowedFields: Set<ObjetEditableField>;
  respoOptions: Array<{ id: string; label: string }>;
  onChange?: (next: ObjetIdentiteValues) => void;
}

const nfFr = new Intl.NumberFormat("fr-FR");

function fmtDim(v: number | null | undefined): string {
  if (v == null) return "—";
  return nfFr.format(v);
}

function parseIntOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
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

  const update = <K extends keyof ObjetIdentiteValues>(
    k: K,
    v: ObjetIdentiteValues[K],
  ) => {
    const next = { ...values, [k]: v };
    setValues(next);
    onChange?.(next);
  };

  const dimsAllNull =
    values.largeur_mm == null &&
    values.longueur_mm == null &&
    values.hauteur_mm == null;

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

      {/* Lot 8.2c — Dimensions (L × l × h en mm) */}
      {(!isReadOnly || !dimsAllNull) && (
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">
            Dimensions (L × l × h, en mm)
          </Label>
          {isReadOnly ? (
            <div className="text-sm">
              {dimsAllNull
                ? "—"
                : `${fmtDim(values.longueur_mm)} × ${fmtDim(values.largeur_mm)} × ${fmtDim(values.hauteur_mm)} mm`}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                min={1}
                step={1}
                placeholder="Long."
                aria-label="Longueur (mm)"
                value={values.longueur_mm ?? ""}
                disabled={!can("longueur_mm")}
                data-testid="fo-longueur"
                onChange={(e) => update("longueur_mm", parseIntOrNull(e.target.value))}
              />
              <Input
                type="number"
                min={1}
                step={1}
                placeholder="Larg."
                aria-label="Largeur (mm)"
                value={values.largeur_mm ?? ""}
                disabled={!can("largeur_mm")}
                data-testid="fo-largeur"
                onChange={(e) => update("largeur_mm", parseIntOrNull(e.target.value))}
              />
              <Input
                type="number"
                min={1}
                step={1}
                placeholder="Haut."
                aria-label="Hauteur (mm)"
                value={values.hauteur_mm ?? ""}
                disabled={!can("hauteur_mm")}
                data-testid="fo-hauteur"
                onChange={(e) => update("hauteur_mm", parseIntOrNull(e.target.value))}
              />
            </div>
          )}
        </div>
      )}

      {/* Lot 8.2c — Matériaux (texte libre) */}
      {(!isReadOnly || (values.materiaux && values.materiaux.trim())) && (
        <div className="grid gap-1.5">
          <Label htmlFor="fo-materiaux">Matériaux</Label>
          <Textarea
            id="fo-materiaux"
            rows={2}
            placeholder="Ex. : chêne massif, panneau MDF 19mm, peinture polyuréthane mat…"
            value={values.materiaux ?? ""}
            disabled={!can("materiaux")}
            data-testid="fo-materiaux"
            onChange={(e) => update("materiaux", e.target.value || null)}
          />
        </div>
      )}

      {/* Lot 8.2c — Finition détaillée (précise le type_finition enum) */}
      {(!isReadOnly || (values.finition_detail && values.finition_detail.trim())) && (
        <div className="grid gap-1.5">
          <Label htmlFor="fo-finition-detail">Finition détaillée</Label>
          <Input
            id="fo-finition-detail"
            placeholder="Ex. : RAL 9016 satiné, vernis incolore mat, patine…"
            value={values.finition_detail ?? ""}
            disabled={!can("finition_detail")}
            data-testid="fo-finition-detail"
            onChange={(e) => update("finition_detail", e.target.value || null)}
          />
        </div>
      )}

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

      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
        <span className="font-medium">Plans CAD</span> — à venir (sera édité par le BE).
      </div>
    </div>
  );
}
