/** Suggère les affaires/opportunités correspondant à un email (numéro cité, puis mots-clés). */
export type AffaireLite = { id: string; numero: string; nom: string; client?: string | null; phase?: string };

const STOP = new Set(["de", "du", "la", "le", "les", "des", "et", "en", "pour", "sur", "au", "aux", "un", "une", "fw", "tr", "re", "fwd", "rv", "demande", "devis", "paris", "the", "a"]);

export function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function tokens(s: string): string[] {
  return norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
}

export function suggestAffaires(text: string, affaires: AffaireLite[], max = 5): { affaire: AffaireLite; score: number }[] {
  const t = norm(text);
  const words = new Set(tokens(text));
  const out: { affaire: AffaireLite; score: number }[] = [];
  for (const a of affaires) {
    let score = 0;
    if (new RegExp(`(^|\\D)${a.numero}(\\D|$)`).test(t)) score += 100;
    const aw = new Set(tokens(`${a.nom} ${a.client ?? ""}`));
    for (const w of aw) if (words.has(w)) score += /\d/.test(w) ? 6 : 10;
    if (score > 0 && a.phase === "signe") score += 1;
    if (score >= 10) out.push({ affaire: a, score });
  }
  return out.sort((x, y) => y.score - x.score || y.affaire.numero.localeCompare(x.affaire.numero)).slice(0, max);
}
