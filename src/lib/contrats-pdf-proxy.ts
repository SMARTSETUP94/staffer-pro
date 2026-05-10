/**
 * Helper proxy PDF contrat (contourne adblockers ciblant URL signées Supabase Storage).
 * Récupère le PDF via edge function `contrat-pdf` puis ouvre / télécharge via blob URL.
 */
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const FN_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/contrat-pdf`;

export async function fetchContratPdfBlob(
  contratId: string,
  opts: { version?: 1 | 2 | 3; download?: boolean } = {},
): Promise<Blob> {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("Non authentifié");

  const params = new URLSearchParams({ id: contratId });
  if (opts.version) params.set("v", String(opts.version));
  if (opts.download) params.set("download", "1");

  const res = await fetch(`${FN_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`PDF indisponible (${res.status})${detail ? ` — ${detail}` : ""}`);
  }
  return await res.blob();
}

/** Retourne une URL blob affichable dans un iframe/viewer inline. L'appelant doit revoke l'URL. */
export async function createContratPdfObjectUrl(contratId: string, version?: 1 | 2 | 3): Promise<string> {
  const blob = await fetchContratPdfBlob(contratId, { version });
  return URL.createObjectURL(blob);
}

/** Ouvre le PDF dans un nouvel onglet (preview inline).
 *  Utilise un <a target="_blank"> click — non bloqué par Chrome (vs window.open après await). */
export async function openContratPdf(contratId: string, version?: 1 | 2 | 3): Promise<void> {
  const blob = await fetchContratPdfBlob(contratId, { version });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Télécharge le PDF (Content-Disposition attachment). */
export async function downloadContratPdf(contratId: string, version?: 1 | 2 | 3): Promise<void> {
  const blob = await fetchContratPdfBlob(contratId, { version, download: true });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contrat-${contratId.slice(0, 8)}-v${version ?? "final"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
