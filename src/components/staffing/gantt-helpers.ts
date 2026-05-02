// v0.35.2 — Helpers Gantt (calcul fenêtre dates, mapping métier→couleur)
import type { MetierKey } from "@/lib/staffing/types";

export const METIER_COLOR: Record<MetierKey, string> = {
  BE: "#185FA5",
  Num: "#534AB7",
  Bois: "#BA7517",
  Metal: "#888780",
  Peint: "#0F6E56",
  Tap: "#D4537E",
  Manut: "#5F5E5A",
};

export const METIER_LABEL: Record<MetierKey, string> = {
  BE: "BE",
  Num: "Numérique",
  Bois: "Bois",
  Metal: "Métal",
  Peint: "Peinture",
  Tap: "Tapisserie",
  Manut: "Manutention",
};

export const METIER_ORDER: MetierKey[] = ["BE", "Num", "Bois", "Metal", "Peint", "Tap", "Manut"];

/** Liste de jours ouvrés (lundi-vendredi) entre deux ISO dates inclus */
export function workingDaysBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

export function formatDayName(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" }).slice(0, 3);
}

/** Index dans la fenêtre de jours ouvrés ; -1 si non trouvé */
export function dayIndex(days: string[], iso: string): number {
  return days.indexOf(iso);
}

/** Renvoie la "span" effective d'un step en jours ouvrés sur la fenêtre */
export function stepSpanInWindow(
  days: string[],
  startISO: string,
  spanDays: number
): { startCol: number; endCol: number; visible: boolean } {
  // Étend les calendar days ; on cherche le 1er jour ouvré dans la fenêtre
  const startD = new Date(startISO + "T00:00:00Z");
  const endD = new Date(startD);
  endD.setUTCDate(endD.getUTCDate() + spanDays - 1);

  const startISOClamp = startD.toISOString().slice(0, 10);
  const endISOClamp = endD.toISOString().slice(0, 10);

  // Cherche premier jour ouvré dans days >= startISOClamp et <= endISOClamp
  const matches = days.filter((d) => d >= startISOClamp && d <= endISOClamp);
  if (matches.length === 0) return { startCol: -1, endCol: -1, visible: false };
  const first = days.indexOf(matches[0]);
  const last = days.indexOf(matches[matches.length - 1]);
  return { startCol: first + 1, endCol: last + 2, visible: true };
}
