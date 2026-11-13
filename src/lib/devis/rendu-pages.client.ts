/** Rendu des pages des PDF de la boîte dans le navigateur (pdf.js), déposé ensuite par une fonction serveur qui revérifie tout. */
import { supabase } from "@/integrations/supabase/client";
import { deposerRenduPage, extraireImagesPdf, categoriserDocumentsAffaire } from "@/lib/server-fns/images-devis.functions";

type PdfDoc = { id: string; affaire_id: string; storage_path: string; filename: string; taille_bytes: number };
const PAGES_MAX = 30, LARGEUR = 1200;

async function enBase64(blob: Blob): Promise<string> {
  const b = new Uint8Array(await blob.arrayBuffer());
  let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Rend les pages manquantes d'un PDF (déjà rendues : ignorées par le serveur grâce à l'empreinte). */
export async function rendrePagesPdf(doc: PdfDoc, pagesDeja: Set<number>, onPage?: (n: number, total: number) => void): Promise<{ pages: number; erreur?: string }> {
  if (doc.taille_bytes > 20 * 1024 * 1024) return { pages: 0, erreur: `PDF trop lourd : ${(doc.taille_bytes / 1048576).toFixed(0)} Mo, limite 20 Mo` };
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const { data: blob, error } = await supabase.storage.from("affaires-photos").download(doc.storage_path);
  if (error || !blob) return { pages: 0, erreur: "Lecture du PDF refusée" };
  let pdf;
  try { pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise; }
  catch (e) { return { pages: 0, erreur: /password/i.test(String(e)) ? "PDF protégé" : "PDF illisible" }; }
  const total = Math.min(PAGES_MAX, pdf.numPages);
  let faites = 0;
  for (let i = 1; i <= total; i++) {
    if (pagesDeja.has(i)) continue;
    const page = await pdf.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(LARGEUR / v1.width, 1600 / v1.height, 3);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    await page.render({ canvas, viewport: vp }).promise;
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    const texte = (await page.getTextContent()).items.map((it: any) => it.str ?? "").join(" ").replace(/\s+/g, " ").trim().slice(0, 4000);
    page.cleanup();
    if (!out) continue;
    await deposerRenduPage({ data: { parentId: doc.id, affaireId: doc.affaire_id, page: i, base64: await enBase64(out), texte: texte || null } });
    faites++; onPage?.(i, total);
  }
  await (pdf as unknown as { cleanup?: () => Promise<void> }).cleanup?.();
  return { pages: faites };
}

/** Préparation complète de la boîte : catégories, texte et images incorporées (serveur), rendu des pages (navigateur). */
export async function preparerBoite(affaireId: string, onEtape?: (msg: string) => void) {
  const erreurs: string[] = [];
  onEtape?.("Tri des documents…");
  await categoriserDocumentsAffaire({ data: { affaireId } }).catch((e) => erreurs.push(`Tri : ${(e as Error).message}`));
  const { data } = await supabase.from("affaire_documents").select("id,affaire_id,storage_path,filename,taille_bytes,mime_type,categorie,document_parent_id,derive_type,page,extraction")
    .eq("affaire_id", affaireId).is("deleted_at", null).limit(400);
  const docs = (data ?? []) as any[];
  const pdfs = docs.filter((d) => !d.document_parent_id && d.mime_type === "application/pdf" && d.categorie !== "devis_setup" && d.categorie !== "offre_fournisseur");
  for (const p of pdfs) {
    const deja = new Set<number>(docs.filter((d) => d.document_parent_id === p.id && d.derive_type === "page").map((d) => d.page));
    if (!p.extraction) {
      onEtape?.(`Lecture de ${p.filename}…`);
      await extraireImagesPdf({ data: { documentId: p.id } }).catch((e) => erreurs.push(`${p.filename} : ${(e as Error).message}`));
    }
    const r = await rendrePagesPdf(p, deja, (n, t) => onEtape?.(`${p.filename} : page ${n}/${t}`)).catch((e) => ({ pages: 0, erreur: (e as Error).message }));
    if (r.erreur) erreurs.push(`${p.filename} : ${r.erreur}`);
  }
  return { erreurs };
}
