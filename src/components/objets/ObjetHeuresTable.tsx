/**
 * Lot 8.2 — Tableau heures par métier (prévu / planifié / réel + écart).
 * Toggle Total ↔ Unitaire avec persistance localStorage globale.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ObjetHeuresMetier } from "@/server/objet-fiche.functions";
import { computeEcart, type EcartTone } from "@/lib/objet-heures-helpers";

type Mode = "total" | "unitaire";
const LS_KEY = "objet-heures-mode";

function readMode(): Mode {
  if (typeof window === "undefined") return "total";
  return (window.localStorage.getItem(LS_KEY) as Mode | null) ?? "total";
}

function fmt(h: number): string {
  return h === 0 ? "—" : `${h.toFixed(1)} h`;
}

const ECART_BADGE_CLASS: Record<EcartTone, string> = {
  muted: "text-muted-foreground border-border",
  success: "border-emerald-300 text-emerald-700 dark:text-emerald-300",
  info: "border-emerald-200 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-300 text-amber-700 dark:text-amber-300",
  destructive: "border-red-300 text-red-700 dark:text-red-300",
};


interface Props {
  heures: ObjetHeuresMetier[];
  quantite: number;
}

export function ObjetHeuresTable({ heures, quantite }: Props) {
  const [mode, setMode] = useState<Mode>(readMode);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, mode);
  }, [mode]);

  // Désactivé si une seule pièce
  const toggleDisabled = quantite <= 1;
  const effectiveMode: Mode = toggleDisabled ? "total" : mode;
  const div = effectiveMode === "unitaire" ? Math.max(1, quantite) : 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Heures par métier</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {effectiveMode === "total"
              ? `Total objet${quantite > 1 ? ` (${quantite} pièces)` : ""}`
              : `Par unité (${quantite} pièces)`}
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Tabs value={effectiveMode} onValueChange={(v) => setMode(v as Mode)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="total" className="h-7 text-xs" disabled={toggleDisabled}>
                      Total
                    </TabsTrigger>
                    <TabsTrigger value="unitaire" className="h-7 text-xs" disabled={toggleDisabled}>
                      Unitaire
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </TooltipTrigger>
            {toggleDisabled && (
              <TooltipContent>1 seule pièce — total = unitaire</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métier</TableHead>
                <TableHead className="text-right">Prévu</TableHead>
                <TableHead className="text-right">Planifié</TableHead>
                <TableHead className="text-right">Réel</TableHead>
                <TableHead className="text-right">Écart</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {heures.map((m) => {
                const p = m.heures_prevues / div;
                const pl = m.heures_planifiees / div;
                const r = m.heures_reelles / div;
                const ec = computeEcart(m.heures_prevues, m.heures_reelles);
                return (
                  <TableRow key={m.metier_id} data-testid={`row-metier-${m.metier_code}`}>
                    <TableCell className="font-medium">{m.metier_libelle}</TableCell>
                    <TableCell className="text-right">{fmt(p)}</TableCell>
                    <TableCell className="text-right">{fmt(pl)}</TableCell>
                    <TableCell className="text-right">{fmt(r)}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={cn("text-xs whitespace-nowrap", ECART_BADGE_CLASS[ec.tone])}
                      >
                        {ec.display}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile : cards empilées */}
        <div className="grid gap-2 p-4 sm:hidden">
          {heures.map((m) => {
            const p = m.heures_prevues / div;
            const pl = m.heures_planifiees / div;
            const r = m.heures_reelles / div;
            const ec = computeEcart(m.heures_prevues, m.heures_reelles);
            return (
              <div
                key={m.metier_id}
                className="rounded-lg border border-border bg-card p-3"
                data-testid={`row-metier-${m.metier_code}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">{m.metier_libelle}</span>
                  <Badge
                    variant="outline"
                    className={cn("text-xs whitespace-nowrap", ECART_BADGE_CLASS[ec.tone])}
                  >
                    {ec.display}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>
                    <div>Prévu</div>
                    <div className="font-medium text-foreground">{fmt(p)}</div>
                  </div>
                  <div>
                    <div>Planifié</div>
                    <div className="font-medium text-foreground">{fmt(pl)}</div>
                  </div>
                  <div>
                    <div>Réel</div>
                    <div className="font-medium text-foreground">{fmt(r)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
