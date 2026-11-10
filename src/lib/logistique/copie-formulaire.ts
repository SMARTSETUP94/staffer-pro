/** Copie mail d'une demande « Formulaire » envoyée à log@ : reconnue par le releveur pour ne pas créer de doublon. */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function objetCopie(projet: string, categorie: string, date: string): string {
  return `LOG – ${projet} – ${categorie} – ${date}`;
}
export function marqueurCopie(demandeId: string): string {
  return `Réf. demande formulaire : ${demandeId}`;
}
/** Renvoie l'identifiant de la demande si le mail est une copie du formulaire, sinon null. */
export function demandeDeCopie(subject: string | null | undefined, body: string | null | undefined): string | null {
  if (!/^\s*LOG\s+[–-]\s+/.test(subject ?? "")) return null;
  const m = new RegExp(`R[ée]f\\. demande formulaire\\s*:\\s*(${UUID})`, "i").exec((body ?? "").replace(/<[^>]+>/g, " "));
  return m ? m[1].toLowerCase() : null;
}
