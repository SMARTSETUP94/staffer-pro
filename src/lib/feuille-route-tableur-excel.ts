/**
 * v0.33 — Export Excel matriciel de la Vue Tableur Feuille de Route.
 *
 * Une ligne par (date × affaire), 10 colonnes alignées sur l'UI tableur :
 *   Date | Code | Typologie | Nom chantier | Adresse | Responsable
 *   | Opération | Horaire | Véhicules (plan) | Véhicules réels | Discordance | Commentaires
 *
 * Les overrides feuille_route_lignes (adresse_override, horaire_rdv,
 * type_operation, commentaires, vehicules_ids) sont déjà mergés dans
 * `FRTableurRow` côté hook — l'export reflète exactement ce que l'utilisateur
 * voit à l'écran.
 *
 * Politique : xlsx-js-style uniquement (cf. mem://constraints/xlsx-package-policy).
 * Module lazy-loadé au clic depuis FeuilleRouteTableurView.
 */
import XLSX from "xlsx-js-style";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { FRTableurRow } from "@/lib/feuille-route-tableur-helpers";
import { AFFAIRE_TYPOLOGIE_LABELS } from "@/lib/affaire-typologie";

export interface VehiculeLite {
  id: string;
  nom: string;
}

export interface BuildFRTableurExportOpts {
  rows: FRTableurRow[];
  /** Pour résoudre les ids véhicules en libellés. */
  vehicules: VehiculeLite[];
  /** Période affichée (pour titre + nom de fichier). */
  periodStart: Date;
  periodEnd: Date;
}

const HEADERS = [
  "Date",
  "Code",
  "Typologie",
  "Nom chantier",
  "Adresse",
  "Responsable",
  "Opération",
  "Horaire RDV",
  "Véhicules (plan)",
  "Véhicules (réels)",
  "Discordance",
  "Commentaires",
] as const;

/** Construit le tableau AOA (array-of-arrays). Exporté pour test. */
export function buildFRTableurAOA(opts: BuildFRTableurExportOpts): string[][] {
  const { rows, vehicules } = opts;
  const vById = new Map(vehicules.map((v) => [v.id, v.nom]));
  const labelVehicules = (ids: string[]) =>
    ids.length === 0
      ? ""
      : ids.map((id) => vById.get(id) ?? id.slice(0, 6)).join(", ");

  const aoa: string[][] = [HEADERS.slice() as unknown as string[]];

  for (const r of rows) {
    const typo = r.typologie_future ?? r.typologie_courante;
    aoa.push([
      format(new Date(`${r.date}T00:00:00`), "EEE dd/MM/yyyy", { locale: fr }),
      r.affaire_numero,
      typo ? AFFAIRE_TYPOLOGIE_LABELS[typo] : "",
      r.affaire_nom,
      r.adresse_affichee ?? "",
      r.responsable_label,
      r.type_operation ?? "",
      r.horaire_rdv ?? "",
      labelVehicules(r.vehicules_ids),
      labelVehicules(r.vehicules_reels_ids),
      r.vehicules_discordance ? "⚠️" : "",
      r.commentaires ?? "",
    ]);
  }

  return aoa;
}

/** Construit le workbook stylé. */
export function buildFRTableurWorkbook(opts: BuildFRTableurExportOpts): {
  wb: XLSX.WorkBook;
  filename: string;
  rowsCount: number;
} {
  const aoa = buildFRTableurAOA(opts);
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!cols"] = [
    { wch: 16 }, // Date
    { wch: 9 }, // Code
    { wch: 18 }, // Typologie
    { wch: 28 }, // Nom
    { wch: 32 }, // Adresse
    { wch: 20 }, // Responsable
    { wch: 14 }, // Opération
    { wch: 11 }, // Horaire
    { wch: 24 }, // Véh plan
    { wch: 24 }, // Véh réels
    { wch: 11 }, // Discordance
    { wch: 36 }, // Commentaires
  ];

  // Style header
  for (let c = 0; c < HEADERS.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    const cell = ws[ref];
    if (!cell) continue;
    cell.s = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { fgColor: { rgb: "1F2937" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "475569" } },
        bottom: { style: "thin", color: { rgb: "475569" } },
        left: { style: "thin", color: { rgb: "475569" } },
        right: { style: "thin", color: { rgb: "475569" } },
      },
    };
  }

  // Style data + zébrage par date
  let lastDate = "";
  let zebra = false;
  for (let i = 1; i < aoa.length; i++) {
    const dateLabel = aoa[i][0];
    if (dateLabel !== lastDate) {
      zebra = !zebra;
      lastDate = dateLabel;
    }
    const fillColor = zebra ? "F8FAFC" : "FFFFFF";
    const discordance = aoa[i][10] !== "";
    for (let c = 0; c < HEADERS.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: i, c });
      const cell = ws[ref] ?? (ws[ref] = { t: "s", v: "" });
      cell.s = {
        font: {
          sz: 10,
          bold: c === 1, // Code en gras
          color:
            discordance && c === 10
              ? { rgb: "B45309" }
              : { rgb: "111827" },
        },
        fill: { fgColor: { rgb: fillColor } },
        alignment: { vertical: "top", wrapText: true },
        border: {
          top: { style: "hair", color: { rgb: "CBD5E1" } },
          bottom: { style: "hair", color: { rgb: "CBD5E1" } },
        },
      };
    }
  }

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(0, aoa.length - 1), c: HEADERS.length - 1 },
  });
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Feuille de route");

  const filename = `feuille-route-tableur-${format(
    opts.periodStart,
    "yyyy-MM-dd",
  )}_${format(opts.periodEnd, "yyyy-MM-dd")}.xlsx`;

  return { wb, filename, rowsCount: aoa.length - 1 };
}

/** Déclenche le téléchargement du .xlsx. */
export function exportFRTableurExcel(opts: BuildFRTableurExportOpts): {
  rowsCount: number;
  filename: string;
} {
  const { wb, filename, rowsCount } = buildFRTableurWorkbook(opts);
  XLSX.writeFile(wb, filename);
  return { rowsCount, filename };
}
