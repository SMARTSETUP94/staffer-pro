import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OppJalon, OppJalonEtape } from "@/server/opportunite-fiche.functions";

const ETAPE_LABEL: Record<OppJalonEtape, string> = {
  qualification: "Qualification",
  devis_envoye: "Devis envoyé",
  negociation: "Négociation",
  signature: "Signature",
};

const ETAPES_ORDER: OppJalonEtape[] = [
  "qualification",
  "devis_envoye",
  "negociation",
  "signature",
];

interface Props {
  jalons: OppJalon[];
}

export function OpportuniteJalonsBar({ jalons }: Props) {
  const byEtape = new Map(jalons.map((j) => [j.etape, j]));

  return (
    <section data-testid="opportunite-jalons-bar">
      <p className="overline mb-3">— Pipeline commercial</p>
      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
        {ETAPES_ORDER.map((etape, idx) => {
          const j = byEtape.get(etape);
          const reached = !!j?.date_atteinte;
          const expected = j?.date_prevue;
          return (
            <div
              key={etape}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-3 text-xs transition-colors",
                reached
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20"
                  : "border-border bg-muted/30",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  Étape {idx + 1}
                </span>
                {reached ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="font-medium">{ETAPE_LABEL[etape]}</div>
              {reached ? (
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Atteint le {new Date(j!.date_atteinte!).toLocaleDateString("fr-FR")}
                </div>
              ) : expected ? (
                <div className="text-[11px] text-muted-foreground">
                  Prévu {new Date(expected).toLocaleDateString("fr-FR")}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground italic">—</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
