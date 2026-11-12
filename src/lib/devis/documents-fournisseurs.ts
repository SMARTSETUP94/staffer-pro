// Règles pures du lot « Documents fournisseurs » (partagées par le serveur, l'écran et les tests).

export const TAILLE_MAX_DOCUMENT = 10 * 1024 * 1024; // 10 Mo, identique à la limite du stockage
export type TypeDocument = "facture" | "proposition" | "confirmation";
export const TYPE_DOCUMENT_LABEL: Record<TypeDocument, string> = {
  facture: "Facture",
  proposition: "Proposition de prix",
  confirmation: "Confirmation de commande",
};

/** Type réel d'après les premiers octets (le nom ou le type annoncé ne suffisent pas). */
export function typeReel(octets: Uint8Array): { mime: "application/pdf" | "image/jpeg" | "image/png"; ext: "pdf" | "jpg" | "png" } | null {
  const b = octets;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return { mime: "application/pdf", ext: "pdf" };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a)
    return { mime: "image/png", ext: "png" };
  return null;
}

/** Chemin de stockage attendu : <utilisateur>/<empreinte>.<ext>. */
export function cheminDocument(userId: string, empreinte: string, ext: string): string {
  return `${userId}/${empreinte}.${ext}`;
}

/** Vérifie qu'un chemin appartient à l'utilisateur et porte l'empreinte attendue. Renvoie l'empreinte ou null. */
export function analyserChemin(chemin: string, userId: string): { empreinte: string; ext: string } | null {
  const m = /^([0-9a-f-]{36})\/([0-9a-f]{64})\.(pdf|jpg|jpeg|png)$/.exec(chemin);
  if (!m || m[1] !== userId) return null;
  return { empreinte: m[2], ext: m[3] };
}

const FRAIS = [
  /\bfrais\b/, /\bport\b/, /\blivraison\b/, /\btransport\b/, /\bexpedition\b/, /\bemballage\b/,
  /\beco[- ]?(participation|contribution|taxe)\b/, /\bpalette(s)?\b.*\b(consign|factur)/, /\bconsigne\b/, /\bfranco\b/, /\bremise globale\b/,
];
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Une ligne de frais (port, livraison, frais fixes…) n'est pas un matériau : elle est écartée. */
export function estLigneFrais(designation: string, signaleeParLecture = false): boolean {
  if (signaleeParLecture) return true;
  const d = norm(designation);
  return FRAIS.some((r) => r.test(d));
}

export type LigneLue = {
  ref: string | null; produit: string; format_texte: string | null; quantite: number | null; unite: string | null;
  prix_net_ht: number | null; est_frais: boolean;
};
export type LigneEcartee = { produit: string; montant: number | null };

/** Sépare matériaux et frais, et ignore les lignes sans désignation. */
export function separerLignes(lignes: LigneLue[]): { materiaux: LigneLue[]; ecartees: LigneEcartee[] } {
  const materiaux: LigneLue[] = []; const ecartees: LigneEcartee[] = [];
  for (const l of lignes) {
    if (!l.produit?.trim()) continue;
    if (estLigneFrais(l.produit, l.est_frais)) ecartees.push({ produit: l.produit.trim(), montant: l.prix_net_ht });
    else materiaux.push(l);
  }
  return { materiaux, ecartees };
}

/** Écart en % entre ancien et nouveau prix (arrondi à 0,1). */
export function ecartPct(ancien: number | null | undefined, nouveau: number | null | undefined): number | null {
  if (ancien == null || nouveau == null || !(ancien > 0)) return null;
  return Math.round(((nouveau - ancien) / ancien) * 1000) / 10;
}

/** Retrouve le fournisseur du catalogue d'après le nom lu (nom contenu dans l'autre, sans accents ni casse). */
export function trouverFournisseur<T extends { id: string; nom: string }>(nomLu: string | null, fournisseurs: T[]): T | null {
  if (!nomLu) return null;
  const k = norm(nomLu).replace(/[^a-z0-9]+/g, " ").trim();
  if (!k) return null;
  let best: T | null = null;
  for (const f of fournisseurs) {
    const n = norm(f.nom).replace(/[^a-z0-9]+/g, " ").trim();
    if (!n) continue;
    if (n === k) return f;
    if ((` ${k} `.includes(` ${n} `) || ` ${n} `.includes(` ${k} `)) && (!best || n.length > norm(best.nom).length)) best = f;
  }
  return best;
}

/** Un prix est proposable dans la recherche s'il est de référence ou ponctuel non expiré (miroir des filtres en base). */
export function prixProposable(p: { type_prix: "reference" | "ponctuel"; valide_jusquau: string | null }, aujourdhui: string): boolean {
  if (p.type_prix === "reference") return true;
  return !!p.valide_jusquau && p.valide_jusquau >= aujourdhui;
}

/** Seul un prix de référence peut servir à mettre à jour les lignes d'autres devis (miroir de devis_materiaux_ecarts). */
export function candidatMiseAJour(p: { type_prix: "reference" | "ponctuel"; actif: boolean }): boolean {
  return p.actif && p.type_prix === "reference";
}

/** Droit de déposer : admin, ou rédacteur de devis avec accès aux coûts (miroir de materiaux_document_peut_deposer). */
export function peutDeposer(c: { admin: boolean; rediger: boolean; couts: boolean }): boolean {
  return c.admin || (c.rediger && c.couts);
}

/** Message lisible pour un refus de doublon renvoyé par la base. */
export function messageDoublon(message: string | null | undefined): string | null {
  if (!message || !message.includes("DOUBLON")) return null;
  return message.replace(/^.*DOUBLON:\s*/, "Ce document a déjà été déposé : ").replace(/^C/, "C");
}

/** Convertit un nombre lu (« 110,68 ») en nombre. */
export function nombre(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
