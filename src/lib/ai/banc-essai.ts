/** Score pur du banc d'essai : compare les échéances proposées à ce que l'équipe a retenu. */
export type LigneRetenue = { type: string; date: string; heure_debut?: string | null; heure_fin?: string | null; lieu?: string | null };
export type LigneProposee = { type?: string | null; date: string; heure_debut?: string | null; lieu?: string | null };
const hh = (s?: string | null) => (s ?? "").slice(0, 5);
const mots = (s?: string | null) => new Set((s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((m) => m.length >= 4));
export function lieuxProches(a?: string | null, b?: string | null): boolean {
  const A = mots(a); for (const m of mots(b)) if (A.has(m)) return true; return false;
}
export type ScoreCas = { nb_etapes: boolean; date: boolean; type: boolean; heures: boolean; lieu: boolean };
export function scorerCas(retenu: LigneRetenue[], propose: LigneProposee[]): ScoreCas {
  const s: ScoreCas = { nb_etapes: retenu.length === propose.length, date: true, type: true, heures: true, lieu: true };
  const libres = [...propose];
  for (const r of retenu) {
    const cands = libres.filter((p) => p.date === r.date);
    const m = cands.find((p) => p.type === r.type) ?? cands[0];
    if (!m) { s.date = false; s.type = false; if (r.heure_debut) s.heures = false; if (r.lieu) s.lieu = false; continue; }
    libres.splice(libres.indexOf(m), 1);
    if (m.type !== r.type) s.type = false;
    if (r.heure_debut && hh(m.heure_debut) !== hh(r.heure_debut)) s.heures = false;
    if (r.lieu && !lieuxProches(m.lieu, r.lieu)) s.lieu = false;
  }
  return s;
}
/** Règle de bascule : Claude au moins aussi bon sur chaque champ, à un cas près. */
export function basculeAutorisee(actuel: Record<string, number>, claude: Record<string, number>, tolerance = 1): boolean {
  return Object.keys(actuel).every((k) => (claude[k] ?? 0) >= (actuel[k] ?? 0) - tolerance);
}
