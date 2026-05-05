// v0.40.0b+1 — StatCard récap Manutention en composant pur testable.
// Affiche : valeur principale (FIN), subline B/P/T (absorbé), bandeau fallback dans le détail.
import { Truck, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ManutSummary } from "@/lib/staffing/manut-summary";

const fmt = (v: number) => `${Math.round(v)} h`;

export function ManutStatCard({ summary }: { summary: ManutSummary | null | undefined }) {
  const m = summary;
  if (!m || m.manut_total_h <= 0) {
    return (
      <Card label="Manutention" value="0 h" testid="manut-statcard" />
    );
  }
  const label = m.is_absorbed ? "Manut FIN + absorbée" : "Manutention (legacy)";
  const subline =
    m.is_absorbed && m.absorbable_total_h > 0 ? (
      <span className="tabular-nums" data-testid="manut-statcard-subline">
        + absorbé :{" "}
        <span className="font-medium text-foreground" data-testid="manut-absorbed-bois">
          B {fmt(m.absorbed_bois_h)}
        </span>
        {" · "}
        <span className="font-medium text-foreground" data-testid="manut-absorbed-peint">
          P {fmt(m.absorbed_peint_h)}
        </span>
        {" · "}
        <span className="font-medium text-foreground" data-testid="manut-absorbed-tap">
          T {fmt(m.absorbed_tap_h)}
        </span>
      </span>
    ) : !m.is_absorbed ? (
      <span data-testid="manut-statcard-legacy">Mode legacy — DÉBUT/TRANSFERT par objet</span>
    ) : null;

  const detail = (
    <div className="space-y-3 text-xs" data-testid="manut-statcard-detail">
      <div>
        <div className="font-bold uppercase tracking-wider text-muted-foreground mb-1">
          Total Manutention devis
        </div>
        <p className="text-foreground tabular-nums">
          {fmt(m.manut_total_h)} — réparties{" "}
          <span className="font-medium">35 % DÉBUT + 15 % TRANSFERT</span> (absorbés)
          {" + "}
          <span className="font-medium">50 % FIN</span> (équipe Manut, 2 derniers jours).
        </p>
      </div>
      <div>
        <div className="font-bold uppercase tracking-wider text-muted-foreground mb-1">
          Manut FIN — équipe dédiée
        </div>
        <p className="text-foreground tabular-nums">
          <span className="font-medium" data-testid="manut-fin-detail">
            {fmt(m.fin_total_h)}
          </span>{" "}
          agrégé chantier (objet_id = null) — visible dans la section globale du Gantt.
        </p>
      </div>
      {m.is_absorbed ? (
        <div>
          <div className="font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Heures ex-Manut absorbées (50 %)
          </div>
          <table className="w-full">
            <tbody>
              <tr className="border-t border-border/50">
                <td className="py-1">Bois</td>
                <td className="py-1 text-right tabular-nums font-medium">{fmt(m.absorbed_bois_h)}</td>
              </tr>
              <tr className="border-t border-border/50">
                <td className="py-1">Peinture</td>
                <td className="py-1 text-right tabular-nums font-medium">{fmt(m.absorbed_peint_h)}</td>
              </tr>
              <tr className="border-t border-border/50">
                <td className="py-1">Tapisserie</td>
                <td className="py-1 text-right tabular-nums font-medium">{fmt(m.absorbed_tap_h)}</td>
              </tr>
              <tr className="border-t border-border font-bold">
                <td className="py-1">Total absorbé</td>
                <td className="py-1 text-right tabular-nums">{fmt(m.absorbable_total_h)} h</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Mode legacy v0.37 actif : Manut DÉBUT/TRANSFERT émis comme étapes Manut par objet
          (non absorbés).
        </p>
      )}
      {m.fallback_objets > 0 && (
        <div
          className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300"
          data-testid="manut-statcard-fallback-banner"
        >
          <span className="font-medium" data-testid="manut-fallback-count">
            {m.fallback_objets}
          </span>{" "}
          objet(s) sans Bois/Peint/Tap : Manut DÉBUT/TRANSFERT conservé en étapes (fallback algo).
        </div>
      )}
    </div>
  );

  return (
    <Card
      label={label}
      value={`${fmt(m.fin_total_h)} FIN`}
      subline={subline}
      detail={detail}
      testid="manut-statcard"
      fallbackBadge={
        m.fallback_objets > 0 ? (
          <span
            className="ml-1 inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300"
            data-testid="manut-statcard-fallback-badge"
            title={`${m.fallback_objets} objet(s) en fallback (sans Bois/Peint/Tap)`}
          >
            {m.fallback_objets} fallback
          </span>
        ) : null
      }
    />
  );
}

function Card({
  label,
  value,
  subline,
  detail,
  testid,
  fallbackBadge,
}: {
  label: string;
  value: string;
  subline?: React.ReactNode;
  detail?: React.ReactNode;
  testid?: string;
  fallbackBadge?: React.ReactNode;
}) {
  const card = (
    <div
      className={`rounded-2xl border border-border bg-card p-4 ${detail ? "cursor-help transition hover:border-primary/40 hover:shadow-sm" : ""}`}
      data-testid={testid}
    >
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Truck className="h-4 w-4" />
        {label}
        {fallbackBadge}
        {detail && <Info className="ml-auto h-3.5 w-3.5 opacity-60" />}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-bold text-foreground" data-testid={testid && `${testid}-value`}>
          {value}
        </p>
      </div>
      {subline && <div className="mt-1 text-[11px] text-muted-foreground">{subline}</div>}
    </div>
  );
  if (!detail) return card;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-left">
          {card}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] max-w-[92vw]">
        {detail}
      </PopoverContent>
    </Popover>
  );
}
