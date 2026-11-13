/**
 * Règles pures appliquées après l'extraction IA des demandes logistiques (L1) :
 * heures normalisées, durée → heure de fin, année déduite de la réception,
 * dates trop anciennes écartées, rapprochement des lieux connus.
 * Le contenu des mails reste une donnée : ces règles ne déclenchent aucune action.
 */
import type { EcheanceDetectee } from "@/lib/shared-inbox-classify";

/** « 7h », « 7h30 », « 07:00 », « 14 h 30 », « 9H » → « HH:MM » ; sinon null. */
export function normaliserHeure(s?: string | null): string | null {
  if (!s) return null;
  const m = String(s).trim().toLowerCase().match(/^(\d{1,2})\s*(?:h|:|\.)\s*(\d{2})?\s*(?:min)?$/) ?? String(s).trim().match(/^(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2] ?? 0);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** Heure de fin = début + durée (même jour, sinon null). */
export function finDepuisDuree(debut: string | null, dureeMin?: number | null): string | null {
  if (!debut || !dureeMin || dureeMin <= 0) return null;
  const [h, m] = debut.split(":").map(Number);
  const t = h * 60 + m + Math.round(dureeMin);
  if (t >= 24 * 60) return null;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

const JOUR = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Corrige une année manifestement fausse (ex. 2024 pour un mail reçu en 2026) :
 * on garde le jour et le mois, et on prend l'année qui place la date le plus près
 * après la réception − 30 jours. Renvoie null si la date reste trop ancienne.
 */
export function corrigerAnnee(date: string, recu: string | null | undefined): { date: string | null; corrigee: boolean } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !recu) return { date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, corrigee: false };
  const r = new Date(recu.slice(0, 10) + "T00:00:00Z").getTime();
  const borne = r - 30 * JOUR;
  const d = new Date(date + "T00:00:00Z").getTime();
  if (d >= borne && d <= r + 2 * 365 * JOUR) return { date, corrigee: false };
  const md = date.slice(5);
  const anR = new Date(r).getUTCFullYear();
  for (const an of [anR, anR + 1]) {
    const c = `${an}-${md}`;
    const t = new Date(c + "T00:00:00Z").getTime();
    if (!Number.isNaN(t) && t >= borne && iso(new Date(t)) === c) return { date: c, corrigee: true };
  }
  return { date: null, corrigee: false };
}

const NUIT = /\bnuit\b|de nuit|nocturne/i;

export type EcheanceRegle = EcheanceDetectee & { duree_minutes?: number | null; annee_corrigee?: boolean };

/** Applique les règles L1 ; renvoie les échéances gardées et le nombre d'écartées (date trop ancienne). */
export function appliquerReglesEcheances(list: EcheanceRegle[], recu: string | null | undefined): { echeances: EcheanceRegle[]; ecartees: number } {
  const out: EcheanceRegle[] = []; let ecartees = 0;
  for (const e of list ?? []) {
    const d = corrigerAnnee(String(e.date ?? ""), recu);
    if (!d.date) { ecartees++; continue; }
    const debut = normaliserHeure(e.heure_debut);
    let fin = normaliserHeure(e.heure_fin);
    const nuit = NUIT.test(`${e.libelle ?? ""} ${e.commentaire ?? ""}`);
    if (fin === "00:00" && !nuit) fin = null;
    if (!fin && debut && e.duree_minutes) fin = finDepuisDuree(debut, e.duree_minutes);
    if (fin && debut && fin <= debut && !nuit) fin = null;
    out.push({ ...e, date: d.date, heure_debut: debut, heure_fin: fin, ...(d.corrigee ? { annee_corrigee: true } : {}) });
  }
  return { echeances: out, ecartees };
}

// ---------- Lieux ----------
export const normaliserLieu = (s?: string | null) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

export type LieuConnu = { id: string; label: string; adresse_complete?: string | null };
export type AliasLieu = { alias: string; lieu_id: string };

/**
 * Rapproche un lieu écrit d'un lieu connu : égalité du libellé ou d'un alias normalisé,
 * ou texte qui commence par cet alias suivi d'une virgule (« Pecqueuse, atelier »).
 * Sinon lieu_id null et lieu_douteux = true si un texte est présent.
 */
export function rapprocherLieu(texte: string | null | undefined, lieux: LieuConnu[], alias: AliasLieu[]): { lieu_id: string | null; lieu_douteux: boolean } {
  const brut = (texte ?? "").trim();
  if (!brut) return { lieu_id: null, lieu_douteux: false };
  const t = normaliserLieu(brut);
  const tete = normaliserLieu(brut.split(/[,(\-–]/)[0]);
  const actifs = new Set(lieux.map((l) => l.id));
  const cles: Array<[string, string]> = [
    ...lieux.map((l) => [normaliserLieu(l.label), l.id] as [string, string]),
    ...alias.filter((a) => actifs.has(a.lieu_id)).map((a) => [normaliserLieu(a.alias), a.lieu_id] as [string, string]),
  ].filter(([k]) => k.length >= 3);
  const ids = new Set(cles.filter(([k]) => k === t || k === tete).map(([, id]) => id));
  if (ids.size === 1) return { lieu_id: [...ids][0], lieu_douteux: false };
  return { lieu_id: null, lieu_douteux: true };
}

/** L'email mentionne-t-il un conditionnement / chargement à l'atelier ? */
export const MENTION_ATELIER = /conditionn|emballag|chargement|charger|chargé/i;
