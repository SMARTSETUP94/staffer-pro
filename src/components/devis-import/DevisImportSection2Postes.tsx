import { Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MetierBadge } from "@/components/MetierBadge";
import type { PosteRow } from "./types";

interface MetierLite {
  id: number;
  libelle: string;
  couleur: string;
}

interface Props {
  postes: PosteRow[];
  metiers: MetierLite[];
  byId: (id: number) => MetierLite | undefined;
  totals: { heures: number; montant: number };
  updatePoste: (key: string, patch: Partial<PosteRow>) => void;
  removePoste: (key: string) => void;
  addPoste: () => void;
}

export function DevisImportSection2Postes({
  postes,
  metiers,
  byId,
  totals,
  updatePoste,
  removePoste,
  addPoste,
}: Props) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Section 2 — Heures par poste
          </h2>
          <Button variant="outline" size="sm" onClick={addPoste} className="rounded-lg">
            <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter un poste
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Métier</th>
                <th className="px-3 py-2 text-right w-[180px]">Heures prévues</th>
                <th className="px-3 py-2 text-right w-[200px]">Montant HT</th>
                <th className="px-3 py-2 text-center w-[60px]">Sources</th>
                <th className="px-3 py-2 w-[60px]"></th>
              </tr>
            </thead>
            <tbody>
              {postes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Aucun poste détecté. Clique sur « Ajouter un poste » pour saisir manuellement.
                  </td>
                </tr>
              )}
              {postes.map((p) => {
                const m = p.metierId ? byId(p.metierId) : null;
                return (
                  <tr key={p.key} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Select
                          value={p.metierId ? String(p.metierId) : ""}
                          onValueChange={(v) => updatePoste(p.key, { metierId: Number(v) })}
                        >
                          <SelectTrigger className="h-9 w-[200px] rounded-lg text-xs">
                            <SelectValue placeholder="Choisir un métier…" />
                          </SelectTrigger>
                          <SelectContent>
                            {metiers.map((mm) => (
                              <SelectItem key={mm.id} value={String(mm.id)}>
                                {mm.libelle}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {m && <MetierBadge libelle={m.libelle} couleur={m.couleur} />}
                        {p.manuel && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">manuel</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={p.heures}
                        onChange={(e) => updatePoste(p.key, { heures: Number(e.target.value) || 0 })}
                        className="h-9 rounded-lg text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={p.montantHt}
                        onChange={(e) => updatePoste(p.key, { montantHt: Number(e.target.value) || 0 })}
                        className="h-9 rounded-lg text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {p.libellesSources.length > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-muted-foreground hover:text-foreground">
                              <Info className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-md">
                            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1">
                              {p.libellesSources.length} ligne(s) source
                            </p>
                            <ul className="space-y-0.5 text-xs">
                              {p.libellesSources.slice(0, 12).map((l, i) => (
                                <li key={i}>• {l}</li>
                              ))}
                              {p.libellesSources.length > 12 && (
                                <li className="opacity-70">… et {p.libellesSources.length - 12} autres</li>
                              )}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePoste(p.key)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/30 text-sm font-semibold">
              <tr className="border-t border-border">
                <td className="px-3 py-2 text-right uppercase text-[11px] tracking-wider text-muted-foreground">
                  Totaux
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.heures} h</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.montant.toLocaleString("fr-FR")} €</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
