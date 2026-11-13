/** Règles pures du lot « Images des devis par l'IA » (partagées app, serveur, outil Claude et tests). */

export const CATEGORIES_BOITE = ["brief", "plan", "visuel", "moodboard", "esquisse_commerciale", "reperage", "offre_fournisseur", "devis_setup", "autre"] as const;
export type CategorieBoite = typeof CATEGORIES_BOITE[number];
export const CATEGORIE_LABEL: Record<string, string> = {
  brief: "Brief / cahier des charges", plan: "Plan ou cote", visuel: "Visuel / rendu 3D", moodboard: "Moodboard",
  esquisse_commerciale: "Esquisse commerciale", reperage: "Photo de repérage", offre_fournisseur: "Offre fournisseur",
  devis_setup: "Devis Set Up", autre: "Autre", logistique: "Logistique",
  avant_montage: "Avant montage", pendant_montage: "Pendant montage", apres_montage: "Après montage",
  avant_demontage: "Avant démontage", pendant_demontage: "Pendant démontage", apres_demontage: "Après démontage", incident: "Incident",
};

/** Notre propre devis renvoyé dans un fil (« Devis 9516-R1.pdf ») : jamais une offre fournisseur, jamais une image de devis. */
export function estDevisSetUp(nom: string): boolean {
  return /^\s*devis[\s_-]*\d{4,5}(-r\d+)?\b/i.test(nom) || /set\s*up.*devis|devis.*set\s*up/i.test(nom);
}
export function categorieParRegle(nom: string): CategorieBoite | null {
  return estDevisSetUp(nom) ? "devis_setup" : null;
}
/** Visible client par défaut : oui pour visuels, moodboards, rendus, esquisses ; non sinon. */
export function visibleClientParDefaut(categorie: string | null | undefined): boolean {
  return categorie === "visuel" || categorie === "moodboard" || categorie === "esquisse_commerciale";
}
/** Catégories jamais proposées comme image de devis. */
export const CATEGORIES_EXCLUES = new Set(["devis_setup", "offre_fournisseur", "logistique", "incident"]);

/** Légende courte, sans prix ni information interne. */
export function nettoyerLegende(s: string | null | undefined): string {
  let t = String(s ?? "").replace(/\s+/g, " ").trim();
  t = t.replace(/\d[\d\s.,]*\s*(€|eur(os)?\b|ht\b|ttc\b)(\s*(ht|ttc)\b)?/gi, "").replace(/€/g, "");
  t = t.replace(/\b(prix|co[uû]ts?|marge|tarif|interne|confidentiel|achat)\b/gi, "").replace(/\s+/g, " ").trim();
  return t.slice(0, 80);
}

export type Proposition = { ligne_id: string; document_id: string; confiance: number; justification: string; legende: string; visible_client: boolean };

/** Sortie IA contrôlée : ids connus, 0–3 images par ligne, pas de doublon, image déjà au devis exclue, champs bornés. */
export function filtrerPropositions(brut: unknown, ctx: { lignes: Set<string>; documents: Map<string, { categorie: string | null }>; dejaAuDevis: Set<string> }): Proposition[] {
  const out: Proposition[] = [];
  const parLigne = new Map<string, Set<string>>();
  const liste = Array.isArray(brut) ? brut : [];
  for (const p of liste) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const ligne = String(r.ligne_id ?? ""), doc = String(r.document_id ?? "");
    const d = ctx.documents.get(doc);
    if (!ctx.lignes.has(ligne) || !d || ctx.dejaAuDevis.has(`${ligne}:${doc}`)) continue;
    if (d.categorie && CATEGORIES_EXCLUES.has(d.categorie)) continue;
    const set = parLigne.get(ligne) ?? new Set();
    if (set.has(doc) || set.size >= 3) continue;
    set.add(doc); parLigne.set(ligne, set);
    const c = Math.round(Number(r.confiance));
    out.push({ ligne_id: ligne, document_id: doc, confiance: Number.isFinite(c) ? Math.min(100, Math.max(0, c)) : 0,
      justification: String(r.justification ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
      legende: nettoyerLegende(String(r.legende ?? "")),
      visible_client: visibleClientParDefaut(d.categorie) });
  }
  return out.sort((a, b) => b.confiance - a.confiance);
}

/** Coût (€) d'un appel Gemini 3 Flash : 0,50 $/M en entrée, 3 $/M en sortie, 1 $ ≈ 0,87 €. */
export const MODELE_IA = "google/gemini-3-flash-preview";
export const PLAFOND_EUR = 0.10;
export const MAX_PAR_HEURE = 5;
export const MAX_IMAGES_PAR_APPEL = 30; // la passerelle accepte 32 images par requête
export const TOKENS_PAR_IMAGE = 1120;
export function coutEur(entree: number, sortie: number): number {
  return Math.round(((entree * 0.5 + sortie * 3) / 1e6) * 0.87 * 10000) / 10000;
}
export function estimerCout(nbImages: number, caracteresTexte: number): { appels: number; cout: number } {
  const appels = Math.max(1, Math.ceil(nbImages / MAX_IMAGES_PAR_APPEL));
  const entree = nbImages * TOKENS_PAR_IMAGE + Math.ceil(caracteresTexte / 3) + 1500 * appels;
  return { appels, cout: coutEur(entree, 4000 * appels) };
}
/** Contrôle avant l'appel IA : limite horaire et plafond de coût. */
export function controlerAvantAppel(recentes: number, estimation: { appels: number; cout: number }): string | null {
  if (recentes >= MAX_PAR_HEURE) return `Limite atteinte : ${MAX_PAR_HEURE} propositions par devis et par heure.`;
  if (estimation.appels > 4) return "Trop d'images candidates (4 appels maximum) : retirez des documents de la boîte.";
  if (estimation.cout > PLAFOND_EUR) return `Coût estimé ${estimation.cout.toFixed(3)} € au-delà du plafond de ${PLAFOND_EUR.toFixed(2)} €.`;
  return null;
}

/** Type réel et dimensions d'une image PNG/JPEG d'après ses octets. */
export function lireImage(b: Uint8Array): { mime: "image/png" | "image/jpeg"; width: number; height: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { mime: "image/png", width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { mime: "image/jpeg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  }
  return null;
}
export const RENDU_MAX_OCTETS = 3 * 1024 * 1024;
export const RENDU_MAX_COTE = 2000;
/** Rendu de page déposé par le navigateur : PNG/JPEG réel, ≤ 3 Mo, côtés 100–2000 px. */
export function validerRendu(b: Uint8Array): { mime: "image/png" | "image/jpeg"; width: number; height: number } {
  if (b.length > RENDU_MAX_OCTETS) throw new Error("Rendu trop lourd (3 Mo maximum)");
  const i = lireImage(b);
  if (!i) throw new Error("Rendu refusé : ce n'est pas une image PNG ou JPEG");
  if (i.width < 100 || i.height < 100 || i.width > RENDU_MAX_COTE || i.height > RENDU_MAX_COTE) throw new Error("Rendu refusé : dimensions hors limites");
  return i;
}
