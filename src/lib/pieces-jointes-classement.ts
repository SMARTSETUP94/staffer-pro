/** Règles pures du classement automatique des pièces jointes d'une demande client (devis@). */

export type ResultatPiece = "classee" | "doublon" | "refusee" | "ecartee_logo";
export type PieceBilan = { attachment_id: string; nom: string; resultat: ResultatPiece; motif?: string | null; document_id?: string | null };
export type EtatClassement = "classe" | "partiel" | "a_reprendre" | "echec";
export type BilanClassement = { etat: EtatClassement; tentatives: number; affaire_id: string; rattache_par: string | null; pieces: PieceBilan[] };

export const MOTIF_LOGO = "écartée : logo de signature probable";
export const PIECES_MAX = 50;
export const TENTATIVES_MAX = 3;

/** Dimensions d'une image PNG ou JPEG lues dans l'en-tête ; null si illisible. */
export function dimensionsImage(b: Uint8Array): { w: number; h: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: v.getUint32(16), h: v.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  }
  return null;
}

/**
 * Logo de signature probable :
 * - image collée dans le mail de moins de 15 Ko, ou de moins de 200 px de large ou de haut ;
 * - ou image dont le nom ressemble à « logo », « signature », « image00x », de moins de 60 Ko ;
 * - ou image collée de moins de 100 Ko identique (même nom, même taille) à une image collée d'un autre mail du même expéditeur.
 */
export function estLogoSignature(p: { nom: string; mime: string; taille: number; inline: boolean; dims?: { w: number; h: number } | null; repetee?: boolean }): boolean {
  if (!/^image\//i.test(p.mime)) return false;
  if (p.inline && p.repetee && p.taille < 100 * 1024) return true;
  if (p.inline && (p.taille < 15 * 1024 || (p.dims && (p.dims.w < 200 || p.dims.h < 200)))) return true;
  return /(logo|signature|^image\d{3})/i.test(p.nom) && p.taille < 60 * 1024;
}

/** État global : tout classé (ou doublon / logo) → classe ; rien de classé et des erreurs → echec ou a_reprendre. */
export function etatBilan(pieces: PieceBilan[], erreurReseau: boolean, tentatives: number): EtatClassement {
  if (erreurReseau) return tentatives >= TENTATIVES_MAX ? "echec" : "a_reprendre";
  if (pieces.some((p) => p.resultat === "refusee")) return pieces.some((p) => p.resultat === "classee" || p.resultat === "doublon") ? "partiel" : "echec";
  return "classe";
}

/** La relance serveur ne reprend que les demandes rattachées, déjà tentées par une personne connue, et pas terminées. */
export function doitRelancer(row: { opportunite_id: string | null; classement_pj: Partial<BilanClassement> | null }): boolean {
  const b = row.classement_pj;
  return !!row.opportunite_id && !!b && b.etat === "a_reprendre" && !!b.rattache_par
    && b.affaire_id === row.opportunite_id && Number(b.tentatives ?? 0) < TENTATIVES_MAX;
}

export const libelleResultat = (p: PieceBilan) =>
  p.resultat === "classee" ? "classée" : p.resultat === "doublon" ? "déjà classée" : p.resultat === "ecartee_logo" ? MOTIF_LOGO : `refusée : ${p.motif ?? "motif inconnu"}`;

/** Clé de comparaison d'une image collée entre deux mails. */
export const cleImage = (nom: unknown, taille: unknown) => `${String(nom ?? "").toLowerCase()}|${Number(taille ?? 0)}`;
