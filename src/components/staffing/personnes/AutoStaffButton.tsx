// Sprint 2b2.2 — bouton auto-staff (1 step ou 1 jour).
import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { autoStaffStep } from "@/server/staffing-autostaff.functions";

export function AutoStaffButton({
  planId,
  stepId,
  onlyDate,
  label,
  compact,
  onDone,
}: {
  planId: string;
  stepId: string;
  onlyDate?: string;
  label: string;
  compact?: boolean;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const r = await autoStaffStep({ data: { stepId, planId, onlyDate } });
      if (r.filled === 0 && r.skipped === 0) {
        toast.info("Étape déjà complète, rien à affecter.");
      } else if (r.filled === 0) {
        toast.warning(`Aucun candidat disponible (${r.skipped} slot(s) non couvert(s)).`);
      } else {
        const noms = r.details
          .slice(0, 3)
          .map((d) => `${d.prenom} ${d.nom[0]}.`)
          .join(", ");
        toast.success(
          `${r.filled} affectation${r.filled > 1 ? "s" : ""} créée${r.filled > 1 ? "s" : ""}` +
            (r.skipped > 0 ? ` · ${r.skipped} slot(s) non couvert(s)` : "") +
            (noms ? ` — ${noms}${r.details.length > 3 ? "…" : ""}` : ""),
        );
      }
      await onDone();
    } catch (err) {
      toast.error((err as Error).message ?? "Échec auto-staffing");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      onClick={run}
      disabled={busy}
      size="sm"
      variant="outline"
      title={label}
      data-write="1"
      className={compact ? "h-7 px-2" : "h-7 px-2 mr-2"}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
      {!compact && <span className="ml-1 text-xs">Auto</span>}
      {compact && <span className="ml-1 text-[10px]">Auto</span>}
    </Button>
  );
}
