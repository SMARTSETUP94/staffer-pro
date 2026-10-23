export function isDocumentAffaireCode(numero: string): boolean {
  return /^[469]\d{3}$/.test(numero);
}

export function documentSearchMatches(values: Array<string | null | undefined>, query: string): boolean {
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalize(values.filter(Boolean).join(" ")).includes(normalize(query.trim()));
}

export function validateEmailDocument(type: string, bytes: number): void {
  const allowed = new Set([
    "image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf", "text/plain", "text/csv",
    "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ]);
  if (!allowed.has(type.toLowerCase())) throw new Error("Format non pris en charge (images, PDF, Word, Excel, PowerPoint ou texte).");
  if (bytes > 15 * 1024 * 1024) throw new Error("Pièce jointe trop volumineuse (> 15 Mo)");
}