import * as XLSX from "xlsx";
import { format } from "date-fns";

/**
 * v0.18.1 — Export trajets sous-traités (CSV UTF-8 BOM + XLSX).
 * Distinct de l'export SILAE : ce fichier sert à transmettre une demande de devis
 * groupée à un transporteur, ou à suivre les sous-traitances en interne.
 */
export interface TrajetExportRow {
  id: string;
  reference: string | null;
  date: string; // YYYY-MM-DD
  heure_depart: string | null;
  heure_arrivee: string | null;
  adresse_depart: string;
  adresse_arrivee: string;
  aller_retour: boolean;
  parent_trajet_id: string | null;
  vehicule_label: string | null;
  vehicule_type: string | null;
  kilometrage: number | null;
  affaire_numero: string | null;
  affaire_nom: string | null;
  categorie: string;
  prestataire: string | null;
  statut_soustraitance: "non" | "a_sous_traiter" | "devis_envoye" | "confirme";
  notes: string | null;
}

export interface TrajetExportFilters {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  statuts?: Array<"a_sous_traiter" | "devis_envoye" | "confirme">;
  prestataire?: string | null;
  affaireId?: string | null;
}

const STATUT_LABEL: Record<TrajetExportRow["statut_soustraitance"], string> = {
  non: "Non sous-traité",
  a_sous_traiter: "À sous-traiter",
  devis_envoye: "Devis envoyé",
  confirme: "Confirmé",
};

const CATEGORIE_LABEL: Record<string, string> = {
  pose: "Pose",
  depose: "Dépose",
  livraison_fourniture: "Livraison fourniture",
  recuperation_materiel: "Récupération matériel",
  autre: "Autre",
};

interface FlatRow {
  reference: string;
  date: string;
  heure_depart: string;
  heure_arrivee: string;
  adresse_depart: string;
  adresse_arrivee: string;
  aller_retour: string;
  vehicule: string;
  kilometrage: string;
  affaire: string;
  code_affaire: string;
  categorie: string;
  prestataire: string;
  statut: string;
  commentaires: string;
}

function aplatir(rows: TrajetExportRow[]): FlatRow[] {
  // v0.19 : on utilise les vraies colonnes `aller_retour` + `reference` + `prestataire`.
  // Pour distinguer aller / retour dans une paire AR, on s'appuie encore sur parent_trajet_id.
  return rows.map((r) => {
    let allerRetourLabel = "Non";
    if (r.aller_retour) {
      allerRetourLabel = r.parent_trajet_id ? "Retour (AR)" : "Aller (AR)";
    }
    return {
      reference: r.reference ?? r.id.slice(0, 8).toUpperCase(),
      date: format(new Date(r.date + "T00:00:00"), "dd/MM/yyyy"),
      heure_depart: r.heure_depart?.slice(0, 5) ?? "",
      heure_arrivee: r.heure_arrivee?.slice(0, 5) ?? "",
      adresse_depart: r.adresse_depart,
      adresse_arrivee: r.adresse_arrivee,
      aller_retour: allerRetourLabel,
      vehicule: r.vehicule_label ?? r.vehicule_type ?? "À attribuer",
      kilometrage: r.kilometrage != null ? String(r.kilometrage) : "",
      affaire: r.affaire_nom ?? "",
      code_affaire: r.affaire_numero ?? "",
      categorie: CATEGORIE_LABEL[r.categorie] ?? r.categorie,
      prestataire: r.prestataire?.trim() ? r.prestataire : "À attribuer",
      statut: STATUT_LABEL[r.statut_soustraitance],
      commentaires: r.notes ?? "",
    };
  });
}

const HEADERS_FR: { key: keyof FlatRow; label: string }[] = [
  { key: "reference", label: "Référence trajet" },
  { key: "date", label: "Date" },
  { key: "heure_depart", label: "Heure départ" },
  { key: "heure_arrivee", label: "Heure arrivée" },
  { key: "adresse_depart", label: "Adresse départ" },
  { key: "adresse_arrivee", label: "Adresse arrivée" },
  { key: "aller_retour", label: "Aller-retour" },
  { key: "vehicule", label: "Véhicule demandé" },
  { key: "kilometrage", label: "Kilométrage estimé" },
  { key: "affaire", label: "Affaire rattachée" },
  { key: "code_affaire", label: "Code affaire" },
  { key: "categorie", label: "Catégorie trajet" },
  { key: "prestataire", label: "Prestataire transporteur" },
  { key: "statut", label: "Statut" },
  { key: "commentaires", label: "Commentaires" },
];

function escapeCsv(v: string): string {
  if (/[;"\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function exportTrajetsSoustraitanceCSV(rows: TrajetExportRow[]): Blob {
  const flat = aplatir(rows);
  const lines: string[] = [];
  lines.push(HEADERS_FR.map((h) => escapeCsv(h.label)).join(";"));
  for (const r of flat) {
    lines.push(HEADERS_FR.map((h) => escapeCsv(String(r[h.key] ?? ""))).join(";"));
  }
  // BOM UTF-8 pour Excel FR
  const content = "\uFEFF" + lines.join("\r\n");
  return new Blob([content], { type: "text/csv;charset=utf-8" });
}

export function exportTrajetsSoustraitanceXLSX(rows: TrajetExportRow[]): Blob {
  const flat = aplatir(rows);
  const aoa: (string | number)[][] = [
    HEADERS_FR.map((h) => h.label),
    ...flat.map((r) => HEADERS_FR.map((h) => r[h.key] ?? "")),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Largeurs
  ws["!cols"] = [
    { wch: 14 }, // référence
    { wch: 11 }, // date
    { wch: 9 },  // h départ
    { wch: 9 },  // h arrivée
    { wch: 35 }, // adresse départ
    { wch: 35 }, // adresse arrivée
    { wch: 11 },
    { wch: 22 },
    { wch: 10 },
    { wch: 25 },
    { wch: 10 },
    { wch: 18 },
    { wch: 22 },
    { wch: 14 },
    { wch: 30 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Trajets sous-traités");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildExportFilename(
  ext: "csv" | "xlsx",
  filters: TrajetExportFilters,
): string {
  const parts: string[] = ["trajets-soustraitance"];
  if (filters.dateFrom) parts.push(filters.dateFrom);
  if (filters.dateTo && filters.dateTo !== filters.dateFrom) parts.push(filters.dateTo);
  return `${parts.join("_")}.${ext}`;
}
