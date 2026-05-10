/**
 * Compresse une image côté client (canvas) avant upload.
 * - max 2560px côté long
 * - JPEG qualité 80 par défaut
 * - garde le type d'origine si non-image (PDF) ou format non supportable
 */

const MAX_LONG_SIDE = 2560;
const DEFAULT_QUALITY = 0.8;

const COMPRESSIBLE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export interface CompressionResult {
  blob: Blob;
  mimeType: string;
  extension: string;
  originalSize: number;
  compressedSize: number;
}

export async function compressImageIfPossible(
  file: File,
  opts: { maxLongSide?: number; quality?: number } = {},
): Promise<CompressionResult> {
  const maxLongSide = opts.maxLongSide ?? MAX_LONG_SIDE;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  // Pas une image compressible → on retourne tel quel
  if (!COMPRESSIBLE.has(file.type)) {
    return {
      blob: file,
      mimeType: file.type || "application/octet-stream",
      extension: extFromName(file.name) ?? extFromMime(file.type),
      originalSize: file.size,
      compressedSize: file.size,
    };
  }

  try {
    const imageBitmap = await createImageBitmap(file);
    const { width: w, height: h } = imageBitmap;
    const longSide = Math.max(w, h);
    const scale = longSide > maxLongSide ? maxLongSide / longSide : 1;
    const targetW = Math.round(w * scale);
    const targetH = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context indisponible");
    ctx.drawImage(imageBitmap, 0, 0, targetW, targetH);
    imageBitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) throw new Error("Compression a échoué");

    return {
      blob,
      mimeType: "image/jpeg",
      extension: "jpg",
      originalSize: file.size,
      compressedSize: blob.size,
    };
  } catch {
    // Fallback : upload tel quel
    return {
      blob: file,
      mimeType: file.type,
      extension: extFromName(file.name) ?? extFromMime(file.type),
      originalSize: file.size,
      compressedSize: file.size,
    };
  }
}

function extFromName(name: string): string | null {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return null;
  return name.slice(idx + 1).toLowerCase();
}

function extFromMime(mime: string): string {
  if (!mime) return "bin";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/heic") return "heic";
  return mime.split("/")[1] ?? "bin";
}
