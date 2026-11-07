import { champsClientManquants } from "./pdf-client";
/** Génère l'Excel ProGBat d'un devis validé, le range dans les exports du devis et renvoie la fiche de contrôle. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cellulesProgbat, construireProgbat, nomFichierProgbat, type DonneesProgbat, type LigneProgbat } from "./progbat-export";
import { BUCKET_EXPORTS } from "./pdf-export";

export async function lireDonneesProgbat(sb: SupabaseClient<Database>, devisId: string) {
  const { data, error } = await sb.rpc("devis_progbat_donnees", { _devis_id: devisId });
  if (error || !data) throw new Error(error?.message ?? "Devis introuvable ou accès refusé");
  return data as unknown as DonneesProgbat;
}

export async function classeurProgbat(lignes: LigneProgbat[]): Promise<Uint8Array> {
  const XLSX = await import("xlsx-js-style");
  const ws = XLSX.utils.aoa_to_sheet(cellulesProgbat(lignes));
  ws["!cols"] = [{ wch: 8 }, { wch: 70 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 12 }];
  lignes.forEach((l, r) => {
    if (l.kind !== "ligne") return;
    const pu = ws[XLSX.utils.encode_cell({ r, c: 4 })]; if (pu) pu.z = "0.00";
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Devis");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

export async function exporterDevisProgbat(sb: SupabaseClient<Database>, devisId: string) {
  const v = await lireDonneesProgbat(sb, devisId);
  const manque = champsClientManquants(v.client);
  if (manque.length) throw new Error(`Fiche client incomplète (${manque.join(", ")}) : complétez la fiche client avant l'export.`);
  const { lignes, fiche } = construireProgbat(v);
  if (!fiche.controle_ok) throw new Error(`Contrôle interne échoué : fichier ${fiche.total_fichier} € ≠ total HT ${fiche.total_ht_attendu} €`);
  const bytes = await classeurProgbat(lignes);
  const path = `${devisId}/${new Date().toISOString().replace(/[:.]/g, "-")}-R${v.version ?? 1}-progbat.xlsx`;
  const up = await sb.storage.from(BUCKET_EXPORTS).upload(path, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false,
  });
  if (up.error) throw new Error("Enregistrement de l'Excel impossible");
  const reg = await sb.rpc("devis_export_progbat_enregistrer", { _devis_id: devisId, _storage_path: path, _taille: bytes.byteLength, _fiche: fiche as never });
  if (reg.error) throw new Error("Historique d'export indisponible");
  return { bytes, path, nom: nomFichierProgbat(v), fiche };
}
