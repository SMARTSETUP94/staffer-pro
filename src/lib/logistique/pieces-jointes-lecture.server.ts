/**
 * Lecture en lecture seule des pièces jointes d'un mail logistique pour l'extraction IA (L1).
 * Outlook n'est jamais modifié. Au plus 3 pièces non intégrées : PDF ≤ 8 Mo, tableur/CSV ≤ 3 Mo (converti en texte).
 * Les images (souvent des logos de signature) ne sont pas lues ici.
 */
import type { Partie } from "@/lib/ai/fournisseur.server";

const GRAPH = "https://graph.microsoft.com/v1.0";
const PDF_MAX = 8 * 1024 * 1024;
const TABLEUR_MAX = 3 * 1024 * 1024;

type Pj = { id: string; name?: string; contentType?: string; size?: number; isInline?: boolean };

export function piecesALire(list: Pj[]): Pj[] {
  return list.filter((a) => !a.isInline).filter((a) => {
    const n = (a.name ?? "").toLowerCase(); const t = (a.contentType ?? "").toLowerCase(); const z = a.size ?? 0;
    if (n.endsWith(".pdf") || t === "application/pdf") return z <= PDF_MAX;
    if (/\.(xlsx|xls|csv)$/.test(n) || t.includes("sheet") || t.includes("excel") || t === "text/csv") return z <= TABLEUR_MAX;
    return false;
  }).slice(0, 3);
}

export async function lirePiecesJointesLogistique(token: string, boite: string, messageId: string): Promise<{ pieces: Partie[]; noms: string[]; erreurs: string[] }> {
  const auth = { Authorization: `Bearer ${token}` };
  const base = `${GRAPH}/users/${encodeURIComponent(boite)}/messages/${encodeURIComponent(messageId)}/attachments`;
  const erreurs: string[] = []; const pieces: Partie[] = []; const noms: string[] = [];
  const r = await fetch(`${base}?$select=id,name,contentType,size,isInline`, { headers: auth, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) return { pieces, noms, erreurs: [`Liste des pièces jointes : Microsoft ${r.status}`] };
  const liste = piecesALire(((await r.json()) as { value?: Pj[] }).value ?? []);
  const { versBase64 } = await import("@/lib/ai/fournisseur.server");
  for (const a of liste) {
    try {
      const res = await fetch(`${base}/${encodeURIComponent(a.id)}/$value`, { headers: auth, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) { erreurs.push(`${a.name} : Microsoft ${res.status} ${(await res.text()).slice(0, 120)}`); continue; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const n = (a.name ?? "piece").toLowerCase();
      if (n.endsWith(".pdf") || (a.contentType ?? "").includes("pdf")) pieces.push({ type: "pdf", nom: a.name ?? "piece.pdf", base64: versBase64(bytes) });
      else if (n.endsWith(".csv")) pieces.push({ type: "text", text: `Pièce jointe ${a.name} :\n${new TextDecoder().decode(bytes).slice(0, 40000)}` });
      else {
        const mod = await import("xlsx-js-style");
        const XLSX = (mod as any).default ?? mod;
        const wb = XLSX.read(bytes, { type: "array", cellDates: true });
        const txt = wb.SheetNames.map((s: string) => `# Feuille ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s], { FS: " | " })}`).join("\n\n");
        pieces.push({ type: "text", text: `Pièce jointe ${a.name} :\n${txt.slice(0, 40000)}` });
      }
      noms.push(a.name ?? "pièce jointe");
    } catch (e) { erreurs.push(`${a.name} : ${(e as Error).message.slice(0, 120)}`); }
  }
  return { pieces, noms, erreurs };
}
