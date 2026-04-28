/**
 * v0.23.1 — Section 3 : objets fabrication détectés depuis le devis Progbat.
 * Tableau interactif de validation chef (cocher / éditer noms / heures par métier).
 */
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { FabMetier } from "@/hooks/use-fabrication";
import type {
  ApplicabilityFlags,
  HeuresParMetier,
  TypeFinition,
} from "@/lib/devis-parser/compute-flags";

export interface EditableObjet {
  selected: boolean;
  numero: string;
  nom: string;
  quantite: number;
  heures: HeuresParMetier;
  budgetMateriaux: number;
  typeFinition: TypeFinition;
  flags: ApplicabilityFlags;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

const METIER_COLS: { key: FabMetier; label: string }[] = [
  { key: "be", label: "BE" },
  { key: "numerique", label: "Num" },
  { key: "bois", label: "Bois" },
  { key: "metal", label: "Métal" },
  { key: "peinture", label: "Peint." },
  { key: "tapisserie", label: "Tap." },
  { key: "manutention", label: "Manut." },
];

function dot(c: EditableObjet["confidence"]): string {
  return c === "high" ? "🟢" : c === "medium" ? "🟡" : "🔴";
}

interface Props {
  objets: EditableObjet[];
  updateObjet: (idx: number, patch: Partial<EditableObjet>) => void;
  updateMetier: (idx: number, metier: FabMetier, value: number) => void;
}

export function DevisImportSection3Objets({ objets, updateObjet, updateMetier }: Props) {
  const selectedCount = objets.filter((o) => o.selected).length;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Section 3 — Objets fabrication ({selectedCount} / {objets.length} sélectionné·s)
          </h2>
          <p className="text-[11px] text-muted-foreground">
            🟢 confiance haute (coché) • 🟡 moyenne • 🔴 ambigu
          </p>
        </div>

        {objets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Aucun objet de fabrication détecté dans ce devis.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-12 text-center">Conf.</TableHead>
                  <TableHead className="min-w-[200px]">Nom</TableHead>
                  <TableHead className="w-16">Qté</TableHead>
                  {METIER_COLS.map((m) => (
                    <TableHead key={m.key} className="w-16 text-right">{m.label}</TableHead>
                  ))}
                  <TableHead className="w-24 text-right">Budget mat.</TableHead>
                  <TableHead className="w-12 text-center">⚠</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {objets.map((o, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Checkbox
                        checked={o.selected}
                        onCheckedChange={(v) => updateObjet(idx, { selected: !!v })}
                      />
                    </TableCell>
                    <TableCell className="text-center text-base">{dot(o.confidence)}</TableCell>
                    <TableCell>
                      <Input
                        value={o.nom}
                        onChange={(e) => updateObjet(idx, { nom: e.target.value })}
                        className="h-8"
                      />
                      {o.numero && (
                        <span className="text-[10px] text-muted-foreground">{o.numero}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={o.quantite}
                        onChange={(e) => updateObjet(idx, { quantite: Number(e.target.value) || 1 })}
                        className="h-8 w-14 text-right tabular-nums"
                      />
                    </TableCell>
                    {METIER_COLS.map((m) => (
                      <TableCell key={m.key} className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          value={o.heures[m.key]}
                          onChange={(e) => updateMetier(idx, m.key, Number(e.target.value) || 0)}
                          className="h-8 w-16 text-right tabular-nums"
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={o.budgetMateriaux}
                        onChange={(e) => updateObjet(idx, { budgetMateriaux: Number(e.target.value) || 0 })}
                        className="h-8 w-20 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {o.warnings.length > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-amber-600 hover:text-amber-700">
                              <Info className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-md">
                            <ul className="space-y-0.5 text-xs">
                              {o.warnings.map((w, i) => (
                                <li key={i}>• {w}</li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
