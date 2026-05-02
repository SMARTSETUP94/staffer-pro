// v0.35.1 — date helpers (ISO YYYY-MM-DD), pure functions, UTC, working days incluent samedi/dimanche
// (les week-ends seront gérés en v0.35.2 avec calendrier fériés). Pour l'algo de base, jours = jours calendaires.

export function toISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function diffDays(a: string, b: string): number {
  const ms = fromISO(b).getTime() - fromISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Liste des dates ISO entre start (inclus) et start+span-1 (inclus) */
export function dateRange(start: string, spanDays: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < spanDays; i++) out.push(addDays(start, i));
  return out;
}

export function maxISO(...dates: string[]): string {
  return dates.reduce((a, b) => (a > b ? a : b));
}

export function minISO(...dates: string[]): string {
  return dates.reduce((a, b) => (a < b ? a : b));
}
