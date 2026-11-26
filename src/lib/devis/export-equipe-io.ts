/**
 * Génération du classeur « Version équipe » d'un devis.
 * xlsx-js-style est importé à la demande (jamais dans le chunk initial d'une route).
 * Les cellules viennent du module pur export-equipe.ts : aucun coût, aucun taux, aucune marge.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { construireExportEquipe, nomFichierEquipe, type Cellule, type DonneesEquipe, type ResultatEquipe } from "./export-equipe";

type Json = Record<string, unknown>;

/** Lit le devis (lecteur déjà autorisé) + les libellés de métiers et de postes, puis normalise. */
export async function lireDonneesEquipe(sb: SupabaseClient<Database>, devisId: string): Promise<DonneesEquipe> {
  const { data, error } = await sb.rpc("devis_lire", { _devis_id: devisId });
  if (error || !data) throw new Error(error?.message ?? "Devis introuvable ou accès refusé");
  const d = data as unknown as Json;
  const devis = (d.devis ?? {}) as Json;
  const calcul = (d.calcul ?? {}) as Json;
  const [metiersRes, postesRes] = await Promise.all([
    sb.from("metiers").select("id,libelle").order("ordre"),
    sb.from("devis_postes_ref").select("id,metier_id"),
  ]);
  const metierDePoste = new Map<string, number | null>(
    ((postesRes.data ?? []) as { id: string; metier_id: number | null }[]).map((p) => [p.id, p.metier_id]),
  );
  const affaire = (d.affaire ?? null) as Json | null;
  const client = (d.client ?? null) as Json | null;
  return {
    numero: String(devis.numero ?? ""), version: devis.version == null ? null : Number(devis.version),
    libelle: (devis.libelle as string | null) ?? null,
    client: client ? String(client.nom ?? "") : null,
    affaire: affaire ? [affaire.numero, affaire.nom].filter(Boolean).join(" · ") || null : null,
    date_devis: (devis.date_devis as string | null) ?? null,
    date_validite: (devis.date_validite as string | null) ?? null,
    total_ht: Number(calcul.total_ht ?? 0), net_ht: Number(calcul.net_ht ?? calcul.total_ht ?? 0),
    lignes: ((d.lignes ?? []) as Json[]).map((l) => ({
      id: String(l.id), parent_id: (l.parent_id as string | null) ?? null, type: String(l.type),
      ordre: Number(l.ordre ?? 0), libelle: (l.libelle as string | null) ?? null,
      quantite: l.quantite == null ? 1 : Number(l.quantite), option_incluse: !!l.option_incluse, texte: (l.texte as string | null) ?? null,
    })),
    heures: ((d.heures ?? []) as Json[]).map((h) => ({
      ligne_id: String(h.ligne_id), heures: Number(h.heures ?? 0), par_unite: !!h.par_unite,
      metier_id: h.metier_id == null ? null : Number(h.metier_id),
      poste_libelle: (h.poste_libelle as string | null) ?? null, niveau: (h.niveau as string | null) ?? null,
    })),
    materiaux: ((d.materiaux ?? []) as Json[]).map((m) => ({
      ligne_id: String(m.ligne_id), designation: String(m.designation ?? ""),
      fournisseur: (m.fournisseur as string | null) ?? null, ref: (m.ref as string | null) ?? null,
      unite: (m.unite as string | null) ?? null, quantite: Number(m.quantite ?? 0),
    })),
    libres: ((d.libres ?? []) as Json[]).map((f) => ({
      ligne_id: String(f.ligne_id), designation: String(f.designation ?? ""),
      unite: (f.unite as string | null) ?? null, quantite: Number(f.quantite ?? 0),
      par_unite: !!f.par_unite, heures_info: f.heures_info == null ? null : Number(f.heures_info),
      metier_id: f.poste_info_id ? metierDePoste.get(String(f.poste_info_id)) ?? null : null,
    })),
    metiers: ((metiersRes.data ?? []) as { id: number; libelle: string }[]).map((m) => ({ id: m.id, libelle: m.libelle })),
  };
}

const LARGEURS: Record<string, number[]> = {
  Synthèse: [26, 60], "Heures par objet": [8, 46, 14, 8, 14, 12, 12, 12, 14], "Détail heures": [8, 40, 26, 12, 10, 10, 10],
  Matériaux: [8, 36, 44, 22, 16, 10, 12],
};

/** Classeur xlsx à partir des feuilles déjà calculées. */
export async function classeurEquipe(res: ResultatEquipe): Promise<Uint8Array> {
  const XLSX = await import("xlsx-js-style");
  const wb = XLSX.utils.book_new();
  const feuilles: [string, Cellule[][]][] = [
    ["Synthèse", res.synthese], ["Heures par objet", res.objets], ["Détail heures", res.detail], ["Matériaux", res.materiaux],
  ];
  for (const [nom, cellules] of feuilles) {
    const ws = XLSX.utils.aoa_to_sheet(cellules);
    const largeurs = LARGEURS[nom];
    if (largeurs) ws["!cols"] = largeurs.map((wch) => ({ wch }));
    for (let c = 0; c < (cellules[0]?.length ?? 0); c++) {
      const a = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[a]) ws[a].s = { font: { bold: true } };
    }
    XLSX.utils.book_append_sheet(wb, ws, nom);
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** Lecture + calcul + classeur : renvoie les octets, le nom de fichier et la fiche de contrôle. */
export async function exporterDevisEquipe(sb: SupabaseClient<Database>, devisId: string) {
  const donnees = await lireDonneesEquipe(sb, devisId);
  const res = construireExportEquipe(donnees);
  const bytes = await classeurEquipe(res);
  return { bytes, nom: nomFichierEquipe(donnees), fiche: res.fiche };
}
