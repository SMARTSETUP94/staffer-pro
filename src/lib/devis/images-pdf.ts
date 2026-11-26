/**
 * Images des PDF de devis : réduites et recompressées avant intégration (le PDF n'embarque jamais l'original pleine taille).
 * Dans le navigateur, redimensionnement par canvas ; côté serveur (pas de canvas), l'image est gardée telle quelle.
 */
import type { ImagePdf } from "./pdf-client";

export const LOGO_MAX_PX = 600;
export const PHOTO_MAX_PX = 1000;
export const QUALITE_JPEG = 0.8;

export function formatImage(bytes: Uint8Array): ImagePdf["format"] | null {
  return bytes[0] === 0x89 && bytes[1] === 0x50 ? "PNG" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "JPEG" : null;
}

/** Dimensions cibles : le plus grand côté ne dépasse jamais `max`, jamais d'agrandissement. */
export function dimensionsCible(w: number, h: number, max: number): { w: number; h: number } {
  const grand = Math.max(w, h);
  if (!(grand > max)) return { w, h };
  const k = max / grand;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Réduit l'image ; PNG avec transparence conservé en PNG, sinon JPEG qualité 80. L'original est rendu en cas d'échec. */
export async function reduireImagePdf(img: ImagePdf, max: number): Promise<ImagePdf> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return img;
    const bmp = await createImageBitmap(new Blob([img.bytes as BlobPart], { type: img.format === "PNG" ? "image/png" : "image/jpeg" }));
    const { w, h } = dimensionsCible(bmp.width, bmp.height, max);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"); if (!ctx) return img;
    ctx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
    let transparent = false;
    if (img.format === "PNG") { const d = ctx.getImageData(0, 0, w, h).data; for (let i = 3; i < d.length; i += 4) if (d[i]! < 255) { transparent = true; break; } }
    const type = transparent ? "image/png" : "image/jpeg";
    const blob: Blob | null = await new Promise((r) => cv.toBlob(r, type, QUALITE_JPEG));
    if (!blob) return img;
    const out = new Uint8Array(await blob.arrayBuffer());
    // Ne jamais alourdir : si le résultat est plus gros que l'original déjà petit, on garde l'original.
    if (out.byteLength >= img.bytes.byteLength && w === bmp.width) return img;
    return { bytes: out, format: transparent ? "PNG" : "JPEG" };
  } catch { return img; }
}

/** Télécharge puis réduit une image du stockage ; null si absente ou format non pris en charge. */
export async function telechargerImagePdf(dl: () => Promise<{ data: Blob | null }>, max: number): Promise<ImagePdf | null> {
  const { data } = await dl();
  if (!data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const format = formatImage(bytes);
  return format ? reduireImagePdf({ bytes, format }, max) : null;
}
