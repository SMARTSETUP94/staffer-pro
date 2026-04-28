/**
 * v0.21.0 Bloc 5 — Export Excel "Feuille de route par jour".
 *
 * Format :
 *   Sheet unique "Planning"
 *   Pour chaque jour de la plage : titre date (gras, fond gris)
 *   Puis pour chaque chantier ce jour :
 *     Ligne en-tête : Code | Nom chantier | Responsable | Opération | Adresse | Commentaires
 *     Ligne données chantier
 *     Liste employés staffés (NOM Prénom en majuscule, métier)
 *   Séparateur vide entre chantiers, et bloc vide entre jours.
 */
import XLSX from "xlsx-js-style";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export interface FeuilleRouteAssignation {
  affaire_id: string;
  date: string; // yyyy-MM-dd
  employe_id: string;
  metier_id: number;
  type_operation: string | null;
}

export interface FeuilleRouteAffaire {
  id: string;
  numero: string;
  nom: string;
  lieu: string | null;
}

export interface FeuilleRouteEmploye {
  id: string;
  prenom: string;
  nom: string;
}

export interface FeuilleRouteMetier {
  id: number;
  libelle: string;
}

export interface FeuilleRouteResponsable {
  affaire_id: string;
  date: string;
  /** label affiché (ex: "Jean DUPONT") */
  label: string;
}

export interface FeuilleRouteRow {
  cells: (string | null)[];
  kind: "date_header" | "chantier_header" | "chantier_data" | "employe" | "spacer";
}

export interface BuildFeuilleRouteOpts {
  /** Dates à exporter (1 à 7), triées chronologiquement */
  dates: Date[];
  affaires: FeuilleRouteAffaire[];
  employes: FeuilleRouteEmploye[];
  metiers: FeuilleRouteMetier[];
  assignations: FeuilleRouteAssignation[];
  /** Map (affaire_id|date) → label responsable */
  responsables: Map<string, string>;
}

const HEADER_LABELS = [
  "Code",
  "Nom chantier",
  "Responsable",
  "Opération",
  "Adresse",
  "Commentaires",
];

/** Construit la liste des lignes (sans style) pour la feuille de route. Exporté pour test. */
export function buildFeuilleRouteRows(opts: BuildFeuilleRouteOpts): FeuilleRouteRow[] {
  const { dates, affaires, employes, metiers, assignations, responsables } = opts;
  const affMap = new Map(affaires.map((a) => [a.id, a]));
  const empMap = new Map(employes.map((e) => [e.id, e]));
  const metMap = new Map(metiers.map((m) => [m.id, m]));

  const rows: FeuilleRouteRow[] = [];

  for (let dIdx = 0; dIdx < dates.length; dIdx++) {
    const d = dates[dIdx];
    const dateISO = format(d, "yyyy-MM-dd");
    const dateLabel = format(d, "EEEE d MMMM yyyy", { locale: fr });

    rows.push({
      kind: "date_header",
      cells: [dateLabel.toUpperCase(), null, null, null, null, null],
    });

    // Affaires staffées ce jour
    const asgsJour = assignations.filter((a) => a.date === dateISO);
    const affaireIds = Array.from(new Set(asgsJour.map((a) => a.affaire_id)));
    const affsJour = affaireIds
      .map((id) => affMap.get(id))
      .filter((a): a is FeuilleRouteAffaire => Boolean(a))
      .sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }));

    if (affsJour.length === 0) {
      rows.push({
        kind: "chantier_data",
        cells: ["—", "Aucun chantier staffé", null, null, null, null],
      });
    }

    for (const aff of affsJour) {
      const respKey = `${aff.id}|${dateISO}`;
      const respLabel = responsables.get(respKey) ?? "—";
      const asgsAff = asgsJour.filter((a) => a.affaire_id === aff.id);
      const operations = Array.from(
        new Set(asgsAff.map((a) => a.type_operation).filter((v): v is string => Boolean(v))),
      ).join(" / ");

      // Header de tableau (répété par chantier pour faciliter la lecture)
      rows.push({ kind: "chantier_header", cells: [...HEADER_LABELS] });

      // Ligne données chantier
      rows.push({
        kind: "chantier_data",
        cells: [
          aff.numero,
          aff.nom,
          respLabel,
          operations || "—",
          aff.lieu ?? "—",
          null, // commentaires libre
        ],
      });

      // Employés staffés (uniques, NOM Prénom en majuscule + métier)
      const employesUniques = new Map<string, { e: FeuilleRouteEmploye; metierId: number }>();
      for (const a of asgsAff) {
        if (!employesUniques.has(a.employe_id)) {
          const e = empMap.get(a.employe_id);
          if (e) employesUniques.set(a.employe_id, { e, metierId: a.metier_id });
        }
      }
      const sortedEmps = Array.from(employesUniques.values()).sort((a, b) =>
        a.e.nom.localeCompare(b.e.nom, "fr"),
      );

      for (const { e, metierId } of sortedEmps) {
        const met = metMap.get(metierId);
        rows.push({
          kind: "employe",
          cells: [
            null,
            `${e.nom.toUpperCase()} ${e.prenom}`,
            met?.libelle ?? "",
            null,
            null,
            null,
          ],
        });
      }

      rows.push({ kind: "spacer", cells: [null, null, null, null, null, null] });
    }

    if (dIdx < dates.length - 1) {
      rows.push({ kind: "spacer", cells: [null, null, null, null, null, null] });
    }
  }

  return rows;
}

/** Construit le workbook et son nom (sans déclencher de téléchargement). */
export function buildFeuilleRouteWorkbook(
  opts: BuildFeuilleRouteOpts,
): { wb: XLSX.WorkBook; filename: string; rowsCount: number } {
  const rows = buildFeuilleRouteRows(opts);

  const aoa: (string | null)[][] = rows.map((r) => r.cells);
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Largeurs
  ws["!cols"] = [
    { wch: 12 },
    { wch: 30 },
    { wch: 22 },
    { wch: 18 },
    { wch: 32 },
    { wch: 30 },
  ];

  // Styles par ligne
  rows.forEach((row, rIdx) => {
    for (let c = 0; c < 6; c++) {
      const ref = XLSX.utils.encode_cell({ r: rIdx, c });
      const cell = ws[ref];
      if (!cell && row.cells[c] == null) continue;
      const target = cell ?? (ws[ref] = { t: "s", v: "" });

      if (row.kind === "date_header") {
        target.s = {
          font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1F2937" } },
          alignment: { horizontal: "left", vertical: "center" },
        };
      } else if (row.kind === "chantier_header") {
        target.s = {
          font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "475569" } },
          alignment: { horizontal: "left" },
          border: {
            top: { style: "thin", color: { rgb: "94A3B8" } },
            bottom: { style: "thin", color: { rgb: "94A3B8" } },
          },
        };
      } else if (row.kind === "chantier_data") {
        target.s = {
          font: { bold: c <= 2, sz: 11 },
          fill: { fgColor: { rgb: "F1F5F9" } },
          alignment: { vertical: "center", wrapText: true },
        };
      } else if (row.kind === "employe") {
        target.s = {
          font: { sz: 10 },
          alignment: { vertical: "center" },
        };
      }
    }
  });

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(0, rows.length - 1), c: 5 },
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planning");

  const filename = `feuille-route-${format(opts.dates[0], "yyyy-MM-dd")}_${format(
    opts.dates[opts.dates.length - 1],
    "yyyy-MM-dd",
  )}.xlsx`;

  return { wb, filename, rowsCount: rows.length };
}

/** Génère et télécharge le .xlsx. */
export function exportFeuilleRouteExcel(opts: BuildFeuilleRouteOpts) {
  const { wb, filename, rowsCount } = buildFeuilleRouteWorkbook(opts);
  XLSX.writeFile(wb, filename);
  return { rowsCount, filename };
}

/** Variante Blob (pour zip). */
export function feuilleRouteToBlob(opts: BuildFeuilleRouteOpts): {
  blob: Blob;
  filename: string;
  rowsCount: number;
} {
  const { wb, filename, rowsCount } = buildFeuilleRouteWorkbook(opts);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return { blob, filename, rowsCount };
}
