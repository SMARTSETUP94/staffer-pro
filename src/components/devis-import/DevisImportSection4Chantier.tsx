/**
 * v0.23.1 — Section 4 : heures chantier (montage/démontage) détectées dans le devis.
 * Opt-in par checkbox pour écraser ou non les valeurs existantes sur l'affaire.
 */
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Props {
  importMontage: boolean;
  setImportMontage: (v: boolean) => void;
  importDemontage: boolean;
  setImportDemontage: (v: boolean) => void;
  montageH: number;
  setMontageH: (v: number) => void;
  demontageH: number;
  setDemontageH: (v: number) => void;
  /** True si un poste machiniste est aussi présent dans Section 2 (warning anti-double-comptage). */
  warnMachiniste?: boolean;
}

export function DevisImportSection4Chantier({
  importMontage,
  setImportMontage,
  importDemontage,
  setImportDemontage,
  montageH,
  setMontageH,
  demontageH,
  setDemontageH,
  warnMachiniste,
}: Props) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Section 4 — Heures chantier (sur site)
        </h2>

        {warnMachiniste && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>
              Un poste « machiniste » est détecté en Section 2. Activer aussi les heures chantier
              ci-dessous peut entraîner un <strong>double comptage</strong>. Vérifie avant de
              valider.
            </p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="imp-montage"
                checked={importMontage}
                onCheckedChange={(v) => setImportMontage(!!v)}
              />
              <Label htmlFor="imp-montage" className="text-sm font-semibold cursor-pointer">
                Importer heures montage
              </Label>
            </div>
            <Input
              type="number"
              min={0}
              step={0.5}
              disabled={!importMontage}
              value={montageH}
              onChange={(e) => setMontageH(Number(e.target.value) || 0)}
              className="mt-2 h-9 text-right tabular-nums"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Écrase <code>heures_prevues_montage</code> de l'affaire.
            </p>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="imp-demontage"
                checked={importDemontage}
                onCheckedChange={(v) => setImportDemontage(!!v)}
              />
              <Label htmlFor="imp-demontage" className="text-sm font-semibold cursor-pointer">
                Importer heures démontage
              </Label>
            </div>
            <Input
              type="number"
              min={0}
              step={0.5}
              disabled={!importDemontage}
              value={demontageH}
              onChange={(e) => setDemontageH(Number(e.target.value) || 0)}
              className="mt-2 h-9 text-right tabular-nums"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Écrase <code>heures_prevues_demontage</code> de l'affaire.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
