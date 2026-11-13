/**
 * Note des devis (module pur) : mêmes règles que devis_texte_modifier / devis_note_fusionner en base.
 */
export const NOTE_MAX = 8000;
export const EXTRAIT_MAX = 200;

/** Ligne de séparation d'un ajout, datée en heure de Paris. */
export function separateurNote(date: Date, auteur: "Claude" | "Staffing" = "Claude") {
  const j = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  return `— Mise à jour du ${j} (${auteur}) —`;
}

/** Note après une écriture « remplacer » ou « ajouter ». Lève si plus de 8 000 caractères. */
export function noteApres(avant: string | null, mode: "remplacer" | "ajouter", texte: string, date: Date, auteur: "Claude" | "Staffing" = "Claude"): string | null {
  const t = texte.trim();
  let r: string | null;
  if (mode === "ajouter" && avant && avant.trim()) {
    if (!t) throw new Error("Texte à ajouter vide");
    r = `${avant.trimEnd()}\n\n${separateurNote(date, auteur)}\n${t}`;
  } else r = t || null;
  if (r && r.length > NOTE_MAX) throw new Error(`Note trop longue (${r.length} caractères, 8 000 au maximum)`);
  return r;
}

/** Fusion d'une note de Claude à la soumission : rien si identique ou déjà à la fin ; ajout si la dernière version est humaine ; sinon remplacement. */
export function fusionNoteClaude(avant: string | null, texte: string, derniereSource: string | null, date: Date): { ecrire: boolean; note: string | null } {
  const t = texte.trim();
  if (!t) return { ecrire: false, note: avant };
  const a = avant?.trim() ? avant : null;
  if (a && (a.trim() === t || a.trimEnd().endsWith(t))) return { ecrire: false, note: avant };
  const note = a && derniereSource === "humain" ? `${a.trimEnd()}\n\n${separateurNote(date)}\n${t}` : t;
  if (note.length > NOTE_MAX) throw new Error(`Note trop longue (${note.length} caractères, 8 000 au maximum)`);
  return { ecrire: true, note };
}

/** Les cases cochées sont repérées par le texte du point : on garde celles encore présentes dans la note. */
export function elaguerCoches(note: string | null, coches: string[]) {
  return note ? coches.filter((c) => note.includes(c)) : [];
}

export function extrait(t: string | null | undefined, n = EXTRAIT_MAX) {
  if (!t) return "";
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/** Markdown simple (listes « - » / « * » / « 1. », **gras**) en blocs, sans HTML. */
export type Segment = { gras: boolean; texte: string };
export type Bloc = { type: "para"; segments: Segment[] } | { type: "liste"; ordonnee: boolean; items: Segment[][] };
export function segments(ligne: string): Segment[] {
  const out: Segment[] = [];
  const re = /\*\*([^*]+)\*\*/g; let i = 0; let m;
  while ((m = re.exec(ligne))) { if (m.index > i) out.push({ gras: false, texte: ligne.slice(i, m.index) }); out.push({ gras: true, texte: m[1] }); i = m.index + m[0].length; }
  if (i < ligne.length) out.push({ gras: false, texte: ligne.slice(i) });
  return out;
}
export function blocsMarkdown(t: string | null | undefined): Bloc[] {
  const blocs: Bloc[] = [];
  for (const brut of (t ?? "").split("\n")) {
    const l = brut.trimEnd();
    const puce = /^\s*[-*•]\s+(.*)$/.exec(l), num = /^\s*\d+[.)]\s+(.*)$/.exec(l);
    const item = puce ?? num;
    if (item) {
      const ord = !puce; const last = blocs[blocs.length - 1];
      if (last?.type === "liste" && last.ordonnee === ord) last.items.push(segments(item[1]));
      else blocs.push({ type: "liste", ordonnee: ord, items: [segments(item[1])] });
    } else if (l.trim()) blocs.push({ type: "para", segments: segments(l) });
  }
  return blocs;
}
