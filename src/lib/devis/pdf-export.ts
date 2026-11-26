/** Génère le PDF client d'un devis, l'enregistre dans le stockage privé des exports et l'historique. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { LOGO_MAX_PX, PHOTO_MAX_PX, telechargerImagePdf } from "./images-pdf";
import { champsClientManquants, construireDevisPdf, type EquipePdf, nomFichierPdf, type DevisClient, type ImagePdf, type NiveauPdf } from "./pdf-client";

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
    const img = await telechargerImagePdf(() => sb.storage.from("devis-photos").download(path), PHOTO_MAX_PX);
    if (img) out[path] = img;
  }));
  return out;
}

/** Logo de l'émetteur, réduit à LOGO_MAX_PX de large. */
export async function chargerLogo(sb: SupabaseClient<Database>, vc: DevisClient): Promise<ImagePdf | null> {
  const p = vc.logo_storage_path;
  return p ? telechargerImagePdf(() => sb.storage.from("devis-photos").download(p), LOGO_MAX_PX) : null;
}

/** `transformer` : variante du contenu (ex. options retenues pour Pennylane), même rendu et même historique. */
export async function exporterDevisPdf(sb: SupabaseClient<Database>, devisId: string, niveau: NiveauPdf, transformer?: (vc: DevisClient) => DevisClient) {
  const lu = await lireDevisClient(sb, devisId);
  const vc = transformer ? { ...transformer(lu), numero_progbat: lu.numero_progbat } : lu;
  const images = niveau === "detaille" ? await chargerImages(sb, vc) : {};
  const logo = await chargerLogo(sb, vc);
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

/** Version équipe : le devis dans sa lecture client (lignes, descriptifs, images), sans aucun montant. Non enregistrée dans l'historique des exports. */
export async function construirePdfEquipeClient(sb: SupabaseClient<Database>, devisId: string, equipe: EquipePdf): Promise<ArrayBuffer> {
  const vc = await lireDevisClient(sb, devisId);
  const images = await chargerImages(sb, vc);
  const logo = await chargerLogo(sb, vc);
  const polices = await import("./polices-pdf");
  return construireDevisPdf({ ...vc, cgv: null } as DevisClient, "detaille", images, { polices, logo, equipe });
}
