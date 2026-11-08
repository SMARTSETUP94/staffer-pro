export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export function verifierLogo(nom: string, taille: number) {
  if (!/\.(png|jpe?g|svg)$/i.test(nom)) throw new Error('Choisissez une image PNG, JPG ou SVG.');
  if (taille > LOGO_MAX_BYTES) throw new Error('Le logo doit faire moins de 5 Mo.');
}
export function verifierSvg(texte: string) {
  if (!/<svg[\s>]/i.test(texte) || /<!DOCTYPE|<!ENTITY|<\s*(script|foreignObject|iframe|object|embed|image|use|style|animate|set)\b|\son\w+\s*=|(?:href|src)\s*=|url\s*\(|@import/i.test(texte)) throw new Error('SVG refusé : scripts, animations et ressources externes non autorisés.');
}
/** Navigateur seulement : images vérifiées et SVG rasterisés pour le PDF. */
export async function preparerLogo(fichier: File): Promise<Blob> {
  verifierLogo(fichier.name, fichier.size); let source: Blob = fichier;
  if (/\.svg$/i.test(fichier.name)) {
    const texte = await fichier.text(); verifierSvg(texte);
    const parsed = new DOMParser().parseFromString(texte, 'image/svg+xml');
    if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') throw new Error('SVG illisible.');
    source = new Blob([texte], { type: 'image/svg+xml' });
  }
  const url = URL.createObjectURL(source);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('Dimensions non autorisées.');
    const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image indisponible.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Conversion impossible.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
