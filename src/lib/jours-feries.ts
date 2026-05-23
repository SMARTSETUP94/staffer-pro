// Lot 2.2 — Helper jours fériés FR (extrait pour usages UI : heatmap, planning…)
// Source canonique : algo Butcher (Pâques) + table statique fixes.
// Note : src/lib/heures-export.ts contient une copie inlined utilisée pour l'export SILAE,
// laissée intacte pour éviter tout risque de régression sur le pipeline d'export.

const JOURS_FERIES_FR_FIXES: { mois: number; jour: number }[] = [
  { mois: 1, jour: 1 },
  { mois: 5, jour: 1 },
  { mois: 5, jour: 8 },
  { mois: 7, jour: 14 },
  { mois: 8, jour: 15 },
  { mois: 11, jour: 1 },
  { mois: 11, jour: 11 },
  { mois: 12, jour: 25 },
];

const LABELS_FIXES: Record<string, string> = {
  "01-01": "Jour de l'an",
  "05-01": "Fête du travail",
  "05-08": "Victoire 1945",
  "07-14": "Fête nationale",
  "08-15": "Assomption",
  "11-01": "Toussaint",
  "11-11": "Armistice",
  "12-25": "Noël",
};

function paques(annee: number): [number, number] {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return [mois, jour];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const _cache = new Map<number, Map<string, string>>();

/** Renvoie une Map<YYYY-MM-DD, label> de tous les jours fériés pour l'année donnée. */
export function joursFeriesAnneeFR(annee: number): Map<string, string> {
  if (_cache.has(annee)) return _cache.get(annee)!;
  const map = new Map<string, string>();
  for (const { mois, jour } of JOURS_FERIES_FR_FIXES) {
    const key = `${annee}-${pad(mois)}-${pad(jour)}`;
    map.set(key, LABELS_FIXES[`${pad(mois)}-${pad(jour)}`] ?? "Férié");
  }
  const [mP, jP] = paques(annee);
  const paquesDate = new Date(annee, mP - 1, jP);
  const offsets: Array<{ off: number; label: string }> = [
    { off: 1, label: "Lundi de Pâques" },
    { off: 39, label: "Ascension" },
    { off: 49, label: "Pentecôte" },
    { off: 50, label: "Lundi de Pentecôte" },
  ];
  for (const { off, label } of offsets) {
    const d = new Date(paquesDate);
    d.setDate(d.getDate() + off);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    map.set(key, label);
  }
  _cache.set(annee, map);
  return map;
}

/** True si dateStr (YYYY-MM-DD) est un jour férié FR. */
export function isJourFerieFR(dateStr: string): boolean {
  const annee = Number(dateStr.slice(0, 4));
  if (!Number.isFinite(annee)) return false;
  return joursFeriesAnneeFR(annee).has(dateStr);
}

/** Renvoie le label du jour férié, ou null. */
export function labelJourFerieFR(dateStr: string): string | null {
  const annee = Number(dateStr.slice(0, 4));
  if (!Number.isFinite(annee)) return null;
  return joursFeriesAnneeFR(annee).get(dateStr) ?? null;
}

/** True si la date (YYYY-MM-DD) est un samedi ou dimanche. */
export function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/** True si la date est non ouvrée FR (WE OU férié). */
export function isJourNonOuvreFR(dateStr: string): boolean {
  return isWeekend(dateStr) || isJourFerieFR(dateStr);
}
