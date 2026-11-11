/** Suggestions d'affaires pour classer un mail : mots clés et codes récents. */
export type AffaireLite = { id: string; numero: string; nom: string; client: string | null; lieu: string | null; statut?: string };

const STOP = new Set("pour avec dans des les une sur par aux que qui est sont vous nous votre notre projet demande devis bonjour merci mail email objet fwd tr re the and paris setup".split(" "));

export function normaliser(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function motsCles(texte: string): string[] {
  return [...new Set(normaliser(texte).split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !STOP.has(m) && !/^\d+$/.test(m)))];
}

export function suggererParMotsCles(texte: string, affaires: AffaireLite[], limite = 5): { affaire: AffaireLite; score: number }[] {
  const codes = new Set(texte.match(/\b\d{4,5}\b/g) ?? []);
  const mots = motsCles(texte);
  return affaires
    .map((a) => {
      const cible = normaliser(`${a.nom} ${a.client ?? ""} ${a.lieu ?? ""}`);
      let score = codes.has(a.numero) ? 100 : 0;
      for (const m of mots) if (cible.includes(m)) score += 1;
      return { affaire: a, score };
    })
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score || Number(y.affaire.numero) - Number(x.affaire.numero))
    .slice(0, limite);
}

/** 3 dernières opportunités (9XXX) + 3 derniers chantiers à 4 chiffres. */
export function codesRecents(affaires: AffaireLite[], parSerie = 3): AffaireLite[] {
  const ok = affaires.filter((a) => a.statut !== "annule" && /^\d{4}$/.test(a.numero)).sort((x, y) => Number(y.numero) - Number(x.numero));
  return [...ok.filter((a) => a.numero.startsWith("9")).slice(0, parSerie), ...ok.filter((a) => !a.numero.startsWith("9")).slice(0, parSerie)];
}
