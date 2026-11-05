/**
 * Module Dispos — helpers purs partagés entre la page publique /dispos
 * et l'écran Staffing « Dispos ». Aucune dépendance navigateur.
 */

export type JourDispo = { jour: string; journee: boolean; soiree: boolean; pas_dispo: boolean };

export const PERMIS_OPTIONS = [
  { value: "B", label: "B" },
  { value: "C", label: "C (porteur)" },
  { value: "CE", label: "CE (semi-remorque)" },
  { value: "aucun", label: "Aucun" },
] as const;

export const CACES_OPTIONS = [
  { value: "R489", label: "R489 chariot élévateur" },
  { value: "R486", label: "R486 nacelle" },
  { value: "aucun", label: "Aucun" },
] as const;

const JOURS_LONG = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const JOURS_COURT = ["L", "M", "M", "J", "V", "S", "D"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** "2026-11-09" → Date UTC à midi (évite les décalages de fuseau). */
export function parseJour(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
export function isoJour(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function ajouterJours(iso: string, n: number): string {
  const d = parseJour(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoJour(d);
}
export function joursSemaine(debut: string): string[] {
  return Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i));
}
/** Lundi de la semaine contenant `iso`. */
export function lundiDe(iso: string): string {
  const d = parseJour(iso);
  const dow = (d.getUTCDay() + 6) % 7;
  return ajouterJours(iso, -dow);
}
export function numeroSemaine(iso: string): number {
  const d = parseJour(iso);
  const dow = (d.getUTCDay() + 6) % 7;
  const jeudi = new Date(d);
  jeudi.setUTCDate(d.getUTCDate() - dow + 3);
  const premierJeudi = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 4, 12));
  const dow1 = (premierJeudi.getUTCDay() + 6) % 7;
  premierJeudi.setUTCDate(premierJeudi.getUTCDate() - dow1 + 3);
  return 1 + Math.round((jeudi.getTime() - premierJeudi.getTime()) / (7 * 86400000));
}
export function libelleJour(iso: string): string {
  const d = parseJour(iso);
  return `${JOURS_LONG[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}`;
}

/** « Semaine du lundi 9 au dimanche 15 novembre » (mois répété si différent). */
export function libelleSemaine(debut: string): string {
  const a = parseJour(debut);
  const b = parseJour(ajouterJours(debut, 6));
  const ma = MOIS[a.getUTCMonth()];
  const mb = MOIS[b.getUTCMonth()];
  return ma === mb
    ? `Semaine du lundi ${a.getUTCDate()} au dimanche ${b.getUTCDate()} ${mb}`
    : `Semaine du lundi ${a.getUTCDate()} ${ma} au dimanche ${b.getUTCDate()} ${mb}`;
}
/** « 9 au 15 novembre » */
export function plageSemaine(debut: string, court = false): string {
  const a = parseJour(debut);
  const b = parseJour(ajouterJours(debut, 6));
  const m = court ? MOIS_COURT : MOIS;
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()} au ${b.getUTCDate()} ${m[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${m[a.getUTCMonth()]} au ${b.getUTCDate()} ${m[b.getUTCMonth()]}`;
}

/** Heure limite (ISO) → « vendredi 6 novembre, 12 h » en heure de Paris. */
export function libelleLimite(isoTs: string, court = false): string {
  const d = new Date(isoTs);
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const mn = g("minute");
  const heure = `${Number(g("hour"))} h${mn && mn !== "00" ? ` ${mn}` : ""}`;
  return court ? `${g("weekday")} ${heure}` : `${g("weekday")} ${g("day")} ${g("month")}, ${heure}`;
}

export function etatJour(j: Partial<JourDispo> | undefined): "J" | "S" | "J+S" | "pas" | "vide" {
  if (!j) return "vide";
  if (j.pas_dispo) return "pas";
  if (j.journee && j.soiree) return "J+S";
  if (j.journee) return "J";
  if (j.soiree) return "S";
  return "vide";
}
export function libelleEtat(j: Partial<JourDispo> | undefined): string {
  const e = etatJour(j);
  return e === "J" ? "Journée" : e === "S" ? "Soirée" : e === "J+S" ? "J + S" : e === "pas" ? "Pas dispo" : "Sans réponse";
}
/** Récap court sous « Merci » : J / S / J+S / — */
export function recapCourt(j: Partial<JourDispo> | undefined): string {
  const e = etatJour(j);
  return e === "pas" || e === "vide" ? "—" : e;
}

export function resumeDispos(jours: Partial<JourDispo>[]): { disponibles: number; sansReponse: number } {
  let disponibles = 0, sansReponse = 0;
  for (const j of jours) {
    const e = etatJour(j);
    if (e === "vide") sansReponse++;
    else if (e !== "pas") disponibles++;
  }
  return { disponibles, sansReponse };
}
export function phraseResume(r: { disponibles: number; sansReponse: number }): string {
  const p = (n: number, s: string) => `${n} ${s}${n > 1 ? "s" : ""}`;
  return `${p(r.disponibles, "jour")} disponible${r.disponibles > 1 ? "s" : ""} · ${p(r.sansReponse, "jour")} sans réponse`;
}

/** Clic sur un bouton : Journée/Soirée cumulables, Pas dispo exclusif. */
export function basculer(j: JourDispo, choix: "journee" | "soiree" | "pas_dispo"): JourDispo {
  if (choix === "pas_dispo") {
    return j.pas_dispo ? { ...j, pas_dispo: false } : { ...j, journee: false, soiree: false, pas_dispo: true };
  }
  return { ...j, [choix]: !j[choix], pas_dispo: false };
}

/** « Aucun » désélectionne les autres ; un autre choix désélectionne « Aucun ». */
export function basculerQualif(liste: string[], v: string): string[] {
  if (liste.includes(v)) return liste.filter((x) => x !== v);
  if (v === "aucun") return ["aucun"];
  return [...liste.filter((x) => x !== "aucun"), v];
}

/** Portable FR : 06/07, 10 chiffres ; accepte espaces, points, +33. */
export function normaliserTelephone(s: string): string | null {
  let t = s.replace(/[^0-9+]/g, "");
  if (t.startsWith("+33")) t = "0" + t.slice(3);
  else if (t.startsWith("0033")) t = "0" + t.slice(4);
  return /^0[67]\d{8}$/.test(t) ? t : null;
}

export function messageWhatsApp(debut: string, heureLimite: string, lien: string): string {
  return `Salut à tous, les dispos de la semaine prochaine (${plageSemaine(debut, true)}) c'est ici, 20 secondes : ${lien} — Réponse avant ${libelleLimite(heureLimite, true)}. Merci !`;
}

export type LigneFiltre = { permis: string[]; caces: string[]; jours: Record<string, Partial<JourDispo>> };
export function passeFiltreDispos(
  l: LigneFiltre,
  f: { permis?: string | null; caces?: string | null; jour?: string | null; moment?: "journee" | "soiree" | null },
): boolean {
  if (f.permis && !l.permis.includes(f.permis)) return false;
  if (f.caces && !l.caces.includes(f.caces)) return false;
  if (f.jour) {
    const j = l.jours[f.jour];
    if (!j || j.pas_dispo) return false;
    if (f.moment === "journee" && !j.journee) return false;
    if (f.moment === "soiree" && !j.soiree) return false;
    if (!f.moment && !j.journee && !j.soiree) return false;
  }
  return true;
}

/** Adresse publique de Staffing (domaine personnalisé) : seule adresse partagée aux intervenants. */
export const STAFFING_URL_PUBLIQUE = "https://staffing.setup.paris";
export const DISPOS_URL_PUBLIQUE = `${STAFFING_URL_PUBLIQUE}/dispos`;
