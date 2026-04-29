/**
 * v0.26.0 — Helpers partagés pour widgets commerce.
 */
import type { OppRow } from "@/hooks/use-opportunites-pipeline";

export function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function fmtShort(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export function getConversionsStats(filtered: OppRow[]) {
  const now = new Date();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  let mois = 0;
  let prev = 0;
  filtered.forEach((o) => {
    if (!o.signed_at) return;
    const d = new Date(o.signed_at);
    if (d >= startThisMonth) mois += 1;
    else if (d >= startPrevMonth && d <= endPrevMonth) prev += 1;
  });
  return { mois, prev, delta: mois - prev };
}
