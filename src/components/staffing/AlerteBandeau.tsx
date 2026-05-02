// v0.35.2 — Bandeau d'alertes plan staffing
import { AlertTriangle, AlertCircle } from "lucide-react";
import type { PlanAlert } from "@/lib/staffing/types";

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string; Icon: typeof AlertTriangle }> = {
  hard: {
    bg: "bg-destructive/10",
    text: "text-destructive",
    border: "border-destructive/30",
    Icon: AlertCircle,
  },
  soft: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    Icon: AlertTriangle,
  },
};

export function AlerteBandeau({ alerts }: { alerts: PlanAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const s = SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.soft;
        const Icon = s.Icon;
        return (
          <div
            key={`${a.code}-${i}`}
            className={`flex items-start gap-2 rounded-xl border ${s.border} ${s.bg} px-4 py-2.5`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.text}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-bold uppercase tracking-wider ${s.text}`}>{a.code}</p>
              <p className="mt-0.5 text-sm text-foreground">{a.message}</p>
              {a.detail && (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border/50 bg-background/60 p-2 text-[11px] sm:grid-cols-4">
                  {a.detail.objet_reference && (
                    <div>
                      <div className="text-muted-foreground">Objet</div>
                      <div className="font-mono font-semibold">{a.detail.objet_reference}</div>
                      {a.detail.objet_nom && (
                        <div className="truncate text-muted-foreground">{a.detail.objet_nom}</div>
                      )}
                    </div>
                  )}
                  {a.detail.machine_id && (
                    <div>
                      <div className="text-muted-foreground">Ressource</div>
                      <div className="font-semibold">{a.detail.machine_id}</div>
                    </div>
                  )}
                  {typeof a.detail.span_days === "number" && (
                    <div>
                      <div className="text-muted-foreground">Durée requise</div>
                      <div className="font-semibold">{a.detail.span_days} j consécutifs</div>
                    </div>
                  )}
                  {a.detail.window_start && a.detail.window_end && (
                    <div>
                      <div className="text-muted-foreground">Plage cherchée</div>
                      <div className="font-semibold">
                        {a.detail.window_start} → {a.detail.window_end}
                      </div>
                    </div>
                  )}
                  <div className="col-span-full mt-1 text-[11px] text-muted-foreground">
                    Dépannage : libérer un créneau CNC dans la plage, réduire la portée Numérique de l'objet, ou décaler la livraison.
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
