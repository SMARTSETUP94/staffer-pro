import { ToolError } from "@lovable.dev/mcp-js";

/** Contrôles purs des fichiers reçus par le connecteur Claude (base64, signature, fin de fichier). Aucun accès réseau ni base. */
export const PHOTO_MAX_OCTETS = 10 * 1024 * 1024;
export const PHOTO_MIMES = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" } as const;
export type Mime = keyof typeof PHOTO_MIMES;

const mo = (n: number) => (n / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
export const trop = (max: number, recu?: number) => new ToolError(`Fichier trop volumineux${recu ? ` (${mo(recu)} Mo reçus)` : ""} : ${mo(max)} Mo maximum`);

/** Type réel d'après la signature du contenu (JPG, PNG, PDF), sinon null. */
export function detecterType(bytes: Uint8Array): Mime | null {
  const sig = (s: number[]) => s.every((b, i) => bytes[i] === b);
  if (sig([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (sig([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (sig([0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  return null;
}
const hexa = (bytes: Uint8Array) => Array.from(bytes.slice(0, 4), b => b.toString(16).padStart(2, "0")).join(" ");
function contient(bytes: Uint8Array, motif: number[], depuis: number) {
  for (let i = bytes.length - motif.length; i >= Math.max(0, depuis); i--) if (motif.every((b, j) => bytes[i + j] === b)) return true;
  return false;
}
/** Fichier complet : JPEG terminé par FFD9, PNG avec bloc IEND, PDF avec %%EOF (quelques octets de fin tolérés). */
export function fichierComplet(bytes: Uint8Array, mime: Mime) {
  const n = bytes.length;
  if (mime === "image/jpeg") return contient(bytes, [0xff, 0xd9], n - 4096);
  if (mime === "image/png") return contient(bytes, [0x49, 0x45, 0x4e, 0x44], n - 64);
  return contient(bytes, [0x25, 0x25, 0x45, 0x4f, 0x46], n - 2048);
}
const FIN: Record<Mime, string> = { "image/jpeg": "marqueur de fin FFD9", "image/png": "bloc IEND", "application/pdf": "marqueur %%EOF" };
export function controlerOctets(bytes: Uint8Array<ArrayBuffer>, mime: Mime | undefined, max: number, opts: { complet?: boolean } = {}) {
  if (bytes.length > max) throw trop(max, bytes.length);
  if (bytes.length === 0) throw new ToolError("Fichier vide");
  const reel = detecterType(bytes);
  if (!reel) throw new ToolError(`Type de fichier refusé : JPG, PNG ou PDF uniquement, d'après le contenu (début reçu : ${hexa(bytes)})`);
  if (mime && mime !== reel) throw new ToolError(`Le contenu ne correspond pas au type annoncé : ${mime} annoncé, ${reel} détecté`);
  if (opts.complet !== false && !fichierComplet(bytes, reel)) throw new ToolError(`Fichier ${PHOTO_MIMES[reel].toUpperCase()} incomplet : ${FIN[reel]} absent après ${bytes.length} octets (fichier probablement tronqué à l'envoi). Renvoyer le fichier entier, ou passer par url, onedrive_chemin ou document_id.`);
  return { bytes, mime: reel };
}

/** Nettoie un texte base64 : préfixe data:, espaces, base64url ; rembourrage ajouté seulement s'il manque. */
export function nettoyerBase64(base64: string) {
  const clean = base64.replace(/^data:[^;,]*;base64,/i, "").replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    const i = clean.search(/[^A-Za-z0-9+/=]|=(?=[^=])/);
    throw new ToolError(`Base64 invalide : caractère inattendu en position ${i} sur ${clean.length} (un « = » ne peut figurer qu'à la fin)`);
  }
  const sans = clean.replace(/=+$/, "");
  const reste = sans.length % 4;
  if (reste === 1) throw new ToolError(`Base64 invalide : ${sans.length} caractères reçus après nettoyage, longueur impossible (probablement tronqué à l'envoi)`);
  if (clean.includes("=") && clean.length % 4 !== 0) throw new ToolError(`Base64 invalide : rembourrage « = » incorrect (${clean.length} caractères)`);
  return clean.includes("=") ? clean : sans + "=".repeat((4 - reste) % 4);
}
/** Décode et contrôle un fichier base64 : type réel (signature), taille et fin de fichier. */
export function controlerFichier(base64: string, mime?: Mime, max = PHOTO_MAX_OCTETS) {
  const clean = nettoyerBase64(base64);
  const approx = Math.floor(clean.length * 3 / 4);
  if (approx > max + 4) throw trop(max, approx);
  let bin: string;
  try { bin = atob(clean); } catch (e) { throw new ToolError(`Base64 indécodable (${clean.length} caractères) : ${e instanceof Error ? e.name : "erreur"}`); }
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return controlerOctets(bytes, mime, max).bytes;
}

export async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, "0")).join("");
}

/** Cause d'erreur notée au journal : jamais le contenu ni le base64, au plus 300 caractères de message. */
export function causeJournal(etape: string, error: unknown, extra: Record<string, number | string | undefined> = {}) {
  const e = error as { name?: string; message?: string } | null;
  const out: Record<string, string | number> = { etape, erreur_type: error instanceof ToolError ? "ToolError" : String(e?.name ?? typeof error), erreur_message: String(e?.message ?? error ?? "").replace(/[A-Za-z0-9+/=]{80,}/g, "[contenu masqué]").slice(0, 300) };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) out[k] = v;
  return out;
}

/** Clés d'un appel qui transportent le fichier : remplacées par l'empreinte pour le hachage des arguments. */
export const SOURCES_FICHIER = ["fichier_base64", "url", "onedrive_chemin", "onedrive_item_id", "fichier_ref"] as const;
export function sansSourceFichier<T extends Record<string, unknown>>(a: T, sha: string | null) {
  const out: Record<string, unknown> = { ...a };
  for (const k of SOURCES_FICHIER) delete out[k];
  if (sha) out.fichier_sha256 = sha;
  return out;
}
