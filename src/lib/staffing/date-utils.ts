// v0.35.8 — date helpers (ISO YYYY-MM-DD), pure functions, UTC.
// Ajout : jours ouvrés (exclut samedi/dimanche + jours fériés FR optionnels).

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

/** Liste des dates ISO entre start (inclus) et start+span-1 (inclus) — jours calendaires. */
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

/* ============================================================ */
/* Jours ouvrés                                                  */
/* ============================================================ */

/** day-of-week UTC (0 = dimanche, 6 = samedi) */
export function dayOfWeek(iso: string): number {
  return fromISO(iso).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const d = dayOfWeek(iso);
  return d === 0 || d === 6;
}

/** Computus de Gauss — dimanche de Pâques (UTC) pour `year` */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=mars, 4=avril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const _holidaysCache = new Map<number, Set<string>>();

/** Jours fériés FR (métropole) pour une année — fixes + mobiles (Pâques). */
export function frenchHolidays(year: number): Set<string> {
  const cached = _holidaysCache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const easterMonday = new Date(easter);
  easterMonday.setUTCDate(easter.getUTCDate() + 1);
  const ascension = new Date(easter);
  ascension.setUTCDate(easter.getUTCDate() + 39);
  const pentecost = new Date(easter);
  pentecost.setUTCDate(easter.getUTCDate() + 50);
  const set = new Set<string>([
    `${year}-01-01`, // Jour de l'an
    toISO(easterMonday), // Lundi de Pâques
    `${year}-05-01`, // Fête du travail
    `${year}-05-08`, // Victoire 1945
    toISO(ascension), // Ascension
    toISO(pentecost), // Lundi de Pentecôte
    `${year}-07-14`, // Fête nationale
    `${year}-08-15`, // Assomption
    `${year}-11-01`, // Toussaint
    `${year}-11-11`, // Armistice
    `${year}-12-25`, // Noël
  ]);
  _holidaysCache.set(year, set);
  return set;
}

/** Set de jours fériés couvrant les années [from..to] inclus. */
export function holidaysRange(fromYear: number, toYear: number): Set<string> {
  const out = new Set<string>();
  for (let y = fromYear; y <= toYear; y++) {
    for (const d of frenchHolidays(y)) out.add(d);
  }
  return out;
}

/** Si `includeWeekends=true`, samedi/dimanche sont considérés ouvrés (fériés FR restent exclus). */
export function isWorkingDay(
  iso: string,
  holidays?: Set<string>,
  includeWeekends = false,
): boolean {
  if (!includeWeekends && isWeekend(iso)) return false;
  if (holidays && holidays.has(iso)) return false;
  return true;
}

/** Avance/recule de `n` jours OUVRÉS (n peut être négatif). n=0 → renvoie iso si ouvré, sinon prochain ouvré dans la direction +1. */
export function addWorkingDays(
  iso: string,
  n: number,
  holidays?: Set<string>,
  includeWeekends = false,
): string {
  if (n === 0) {
    let cur = iso;
    while (!isWorkingDay(cur, holidays, includeWeekends)) cur = addDays(cur, 1);
    return cur;
  }
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let cur = iso;
  while (remaining > 0) {
    cur = addDays(cur, step);
    if (isWorkingDay(cur, holidays, includeWeekends)) remaining -= 1;
  }
  return cur;
}

export function previousWorkingDay(
  iso: string,
  holidays?: Set<string>,
  includeWeekends = false,
): string {
  let cur = iso;
  while (!isWorkingDay(cur, holidays, includeWeekends)) cur = addDays(cur, -1);
  return cur;
}

export function nextWorkingDay(
  iso: string,
  holidays?: Set<string>,
  includeWeekends = false,
): string {
  let cur = iso;
  while (!isWorkingDay(cur, holidays, includeWeekends)) cur = addDays(cur, 1);
  return cur;
}

export function workingDateRange(
  start: string,
  spanDays: number,
  holidays?: Set<string>,
  includeWeekends = false,
): string[] {
  if (spanDays <= 0) return [];
  const out: string[] = [];
  let cur = nextWorkingDay(start, holidays, includeWeekends);
  for (let i = 0; i < spanDays; i++) {
    out.push(cur);
    if (i < spanDays - 1) cur = addWorkingDays(cur, 1, holidays, includeWeekends);
  }
  return out;
}

export function workingDaysBetween(
  a: string,
  b: string,
  holidays?: Set<string>,
  includeWeekends = false,
): number {
  if (a > b) return 0;
  let n = 0;
  let cur = a;
  while (cur <= b) {
    if (isWorkingDay(cur, holidays, includeWeekends)) n += 1;
    cur = addDays(cur, 1);
  }
  return n;
}
