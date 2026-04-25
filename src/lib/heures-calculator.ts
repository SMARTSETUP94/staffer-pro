/**
 * Calcul automatique des heures travaillées et des heures de nuit
 * à partir d'une plage horaire (heure_debut, heure_fin) et d'une durée de pause.
 *
 * Convention :
 * - heure_debut / heure_fin au format "HH:mm" (24h)
 * - Si heure_fin <= heure_debut, on considère un shift de nuit qui passe minuit
 *   (ex: 20:00 → 04:00 = 8h)
 * - Pause exprimée en minutes, soustraite du total
 * - Heures de nuit = overlap avec la plage [00:00 - 06:00] (convention spectacle vivant)
 *   La pause N'EST PAS retirée des heures de nuit (la pause prise en journée n'a aucun
 *   impact, et la pause la nuit reste rare ; on garde le calcul simple et toujours conservateur).
 */

const MS_PER_MIN = 60_000;
const NIGHT_START_MIN = 0; // 00h
const NIGHT_END_MIN = 6 * 60; // 06h

/** Convertit "HH:mm" en minutes depuis 00:00. Retourne null si invalide. */
export function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (h < 0 || h > 23 || mn < 0 || mn > 59) return null;
  return h * 60 + mn;
}

/** Arrondi à 2 décimales pour les heures (évite les artefacts flottants). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface HeuresComputed {
  /** Heures totales travaillées (fin - début - pause), en heures décimales. */
  heuresReelles: number;
  /** Heures effectuées sur la plage 00h–06h, en heures décimales. */
  heuresNuit: number;
  /** Durée brute (avant déduction de la pause), en minutes. */
  dureeBruteMin: number;
}

/**
 * Calcule les heures réalisées + heures de nuit à partir d'une plage horaire.
 *
 * @param debut "HH:mm" ou null
 * @param fin "HH:mm" ou null
 * @param pauseMinutes durée de pause en minutes (défaut 0)
 * @returns { heuresReelles, heuresNuit, dureeBruteMin } ou null si entrées invalides
 */
export function computeHeuresFromTimes(
  debut: string | null | undefined,
  fin: string | null | undefined,
  pauseMinutes: number = 0,
): HeuresComputed | null {
  const debutMin = parseTime(debut);
  const finMin = parseTime(fin);
  if (debutMin === null || finMin === null) return null;

  // Gestion overnight : si fin <= début, on ajoute 24h
  let dureeBruteMin = finMin - debutMin;
  if (dureeBruteMin <= 0) {
    dureeBruteMin += 24 * 60;
  }

  // Pause clamp : ne peut pas être négative, ni supérieure à la durée brute
  const pauseClamp = Math.max(0, Math.min(pauseMinutes || 0, dureeBruteMin));
  const dureeNetMin = dureeBruteMin - pauseClamp;
  const heuresReelles = round2(dureeNetMin / 60);

  // Heures de nuit : overlap avec [00:00 - 06:00]
  // On parcourt le shift en convention "minutes depuis le début du shift",
  // en projetant chaque minute sur la plage 0-1440 (jour 1) ou 1440-2880 (jour 2)
  const startAbs = debutMin;
  const endAbs = debutMin + dureeBruteMin;

  let nuitMin = 0;
  // Plage de nuit jour 1 : [0, 360]
  nuitMin += overlap(startAbs, endAbs, NIGHT_START_MIN, NIGHT_END_MIN);
  // Plage de nuit jour 2 : [1440, 1440+360] (si on dépasse minuit)
  nuitMin += overlap(
    startAbs,
    endAbs,
    24 * 60 + NIGHT_START_MIN,
    24 * 60 + NIGHT_END_MIN,
  );

  return {
    heuresReelles,
    heuresNuit: round2(nuitMin / 60),
    dureeBruteMin,
  };
}

/** Overlap entre deux intervalles [a1, a2] et [b1, b2] (en minutes). */
function overlap(a1: number, a2: number, b1: number, b2: number): number {
  const start = Math.max(a1, b1);
  const end = Math.min(a2, b2);
  return Math.max(0, end - start);
}

/** Formate des minutes en "HH:mm" (utile pour debug / affichage). */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
