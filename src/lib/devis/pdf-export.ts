/** Génère le PDF client d'un devis, l'enregistre dans le stockage privé des exports et l'historique. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { champsClientManquants, construireDevisPdf, nomFichierPdf, type DevisClient, type ImagePdf, type NiveauPdf } from "./pdf-client";

export const BUCKET_EXPORTS = "devis-exports";

export async function lireDevisClient(sb: SupabaseClient<Database>, devisId: string) {
  const { data, error } = await sb.rpc("devis_lire_client", { _devis_id: devisId });
  if (error || !data) throw new Error("Devis introuvable ou accès refusé");
  const vc = data as unknown as DevisClient;
  const pg = await sb.from("devis").select("numero_progbat").eq("id", devisId).maybeSingle();
  return { ...vc, numero_progbat: pg.data?.numero_progbat ?? null };
}

/** Vignettes visibles client (images seulement) ; une image illisible est simplement omise. */
export async function chargerImages(sb: SupabaseClient<Database>, vc: DevisClient) {
  const out: Record<string, ImagePdf> = {};
  await Promise.all(vc.photos.filter((p) => p.mime !== "application/pdf").map(async (p) => {
    const path = p.thumb_path ?? p.storage_path;
    const { data } = await sb.storage.from("devis-photos").download(path);
    if (!data) return;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const format = bytes[0] === 0x89 && bytes[1] === 0x50 ? "PNG" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "JPEG" : null;
    if (format) out[path] = { bytes, format };
  }));
  return out;
}

export async function exporterDevisPdf(sb: SupabaseClient<Database>, devisId: string, niveau: NiveauPdf) {
  const vc = await lireDevisClient(sb, devisId);
  const images = niveau === "detaille" ? await chargerImages(sb, vc) : {};
  let logo: ImagePdf | null = null;
  if (vc.logo_storage_path) {
    const { data } = await sb.storage.from("devis-photos").download(vc.logo_storage_path);
    if (data) {
      const bytes = new Uint8Array(await data.arrayBuffer());
      const format = bytes[0] === 0x89 && bytes[1] === 0x50 ? "PNG" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "JPEG" : null;
      if (format) logo = { bytes, format };
    }
  }
  const polices = await import("./polices-pdf");
  const buf = construireDevisPdf(vc, niveau, images, { polices, logo });
  const bytes = new Uint8Array(buf);
  const path = `${devisId}/${new Date().toISOString().replace(/[:.]/g, "-")}-R${vc.version ?? 1}-${niveau}.pdf`;
  const up = await sb.storage.from(BUCKET_EXPORTS).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("Enregistrement du PDF impossible");
  const reg = await sb.rpc("devis_export_enregistrer", { _devis_id: devisId, _niveau: niveau, _storage_path: path, _taille: bytes.byteLength });
  if (reg.error) throw new Error("Historique d'export indisponible");
  return { vc, bytes, avertissements: champsClientManquants(vc.client), path, nom: nomFichierPdf(vc, niveau), export: reg.data as { id: string; version: number; filigrane: boolean } };
}
