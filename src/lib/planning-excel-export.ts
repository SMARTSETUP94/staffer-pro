import XLSX from "xlsx-js-style";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import type {
  Affaire,
  Assignation,
  Employe,
  Metier,
  ChefRef,
  DevisConsommation,
  Absence,
} from "@/hooks/use-planning-data";

const ABSENCE_LABEL: Record<string, string> = {
  conges: "CP",
  formation: "FORM",
  arret_maladie: "AM",
  rtt: "RTT",
  autre: "ABS",
};

interface BuildOpts {
  weekStart: Date;
  metiers: Metier[];
  employes: Employe[];
  affaires: Affaire[];
  assignations: Assignation[];
  consommation: DevisConsommation[];
  absences: Absence[];
  chefsById: Map<string, ChefRef>;
}

type Cell = XLSX.CellObject & { s?: any };

const BORDER_THIN = { style: "thin", color: { rgb: "CCCCCC" } } as const;
const BORDER_ALL = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
  fill: { fgColor: { rgb: "1F2937" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: BORDER_ALL,
};

const SUBHEADER_STYLE = {
  font: { bold: true, sz: 10 },
  fill: { fgColor: { rgb: "F3F4F6" } },
  alignment: { horizontal: "center", vertical: "center" },
  border: BORDER_ALL,
};

const NAME_STYLE = {
  font: { bold: true, sz: 10 },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  border: BORDER_ALL,
};

const SUB_INFO_STYLE = {
  font: { sz: 9, color: { rgb: "6B7280" } },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  border: BORDER_ALL,
};

function hexFromCss(c: string | null | undefined): string {
  if (!c) return "E5E7EB";
  // Accept #rrggbb or hsl/oklch — fallback gris si non hex
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  return m ? m[1].toUpperCase() : "E5E7EB";
}

function cellAssign(
  affaireNum: string,
  metier: Metier,
  demi: "AM" | "PM" | "JOURNEE",
  statutConfirmation?: "non_requise" | "en_attente" | "confirmee" | "refusee",
): Cell {
  const baseLabel = demi === "JOURNEE" ? affaireNum : `${affaireNum} (${demi})`;
  const suffix =
    statutConfirmation === "en_attente" ? " ⏳"
    : statutConfirmation === "confirmee" ? " ✓"
    : statutConfirmation === "refusee" ? " ✕"
    : "";
  return {
    t: "s",
    v: baseLabel + suffix,
    s: {
      font: { bold: true, sz: 9, color: { rgb: "111827" } },
      fill: { fgColor: { rgb: hexFromCss(metier.couleur) } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: BORDER_ALL,
    },
  };
}

function cellAbsence(type: string): Cell {
  return {
    t: "s",
    v: ABSENCE_LABEL[type] ?? "ABS",
    s: {
      font: { bold: true, sz: 9, color: { rgb: "6B7280" }, italic: true },
      fill: { fgColor: { rgb: "F3F4F6" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: BORDER_ALL,
    },
  };
}

function cellEmpty(): Cell {
  return { t: "s", v: "", s: { border: BORDER_ALL } };
}

function buildEmployeSheet(
  title: string,
  employes: Employe[],
  opts: BuildOpts,
): XLSX.WorkSheet {
  const { weekStart, metiers, affaires, assignations, absences } = opts;
  const metierById = new Map(metiers.map((m) => [m.id, m]));
  const affaireById = new Map(affaires.map((a) => [a.id, a]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const aoa: Cell[][] = [];

  // Titre fusionné
  const titleRow: Cell[] = [
    {
      t: "s",
      v: `${title} — Semaine ${format(weekStart, "II")} — ${format(weekStart, "d MMM", { locale: fr })} → ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: fr })}`,
      s: {
        font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "111827" } },
        alignment: { horizontal: "left", vertical: "center" },
      },
    },
  ];
  aoa.push(titleRow);
  aoa.push([{ t: "s", v: "" }]); // ligne vide

  // En-têtes : Employé | Métier | Lun | Mar | Mer | Jeu | Ven | Sam | Dim
  const header: Cell[] = [
    { t: "s", v: "Employé", s: HEADER_STYLE },
    { t: "s", v: "Métier", s: HEADER_STYLE },
    ...days.map((d) => ({
      t: "s" as const,
      v: format(d, "EEE d MMM", { locale: fr }),
      s: HEADER_STYLE,
    })),
  ];
  aoa.push(header);

  // Lignes employés
  for (const emp of employes) {
    const metierEmp = metierById.get(emp.metier_principal_id);
    const sub = emp.type_contrat === "Interim" && emp.agence_interim ? ` · ${emp.agence_interim}` : "";

    const row: Cell[] = [
      { t: "s", v: `${emp.prenom} ${emp.nom}${sub}`, s: NAME_STYLE },
      {
        t: "s",
        v: metierEmp?.libelle ?? "",
        s: {
          ...SUB_INFO_STYLE,
          fill: { fgColor: { rgb: hexFromCss(metierEmp?.couleur) } },
          font: { sz: 9, bold: true, color: { rgb: "111827" } },
          alignment: { horizontal: "center", vertical: "center" },
        },
      },
    ];

    for (const day of days) {
      const dStr = format(day, "yyyy-MM-dd");
      // Absence chevauchant ce jour ?
      const abs = absences.find((a) => a.date_debut <= dStr && a.date_fin >= dStr && a.employe_id === emp.id);
      if (abs) {
        row.push(cellAbsence(abs.type));
        continue;
      }
      // Assignations du jour
      const dayAssigns = assignations.filter((a) => a.employe_id === emp.id && a.date === dStr);
      if (dayAssigns.length === 0) {
        row.push(cellEmpty());
        continue;
      }
      // Si une seule, simple
      if (dayAssigns.length === 1) {
        const a = dayAssigns[0];
        const aff = affaireById.get(a.affaire_id);
        const met = metierById.get(a.metier_id);
        if (aff && met) {
          row.push(cellAssign(aff.numero, met, a.demi_journee));
        } else {
          row.push(cellEmpty());
        }
        continue;
      }
      // Plusieurs : on concatène AM / PM
      const am = dayAssigns.find((a) => a.demi_journee === "AM");
      const pm = dayAssigns.find((a) => a.demi_journee === "PM");
      const journee = dayAssigns.find((a) => a.demi_journee === "JOURNEE");
      const parts: string[] = [];
      if (journee) {
        const aff = affaireById.get(journee.affaire_id);
        if (aff) parts.push(aff.numero);
      } else {
        if (am) {
          const aff = affaireById.get(am.affaire_id);
          if (aff) parts.push(`AM:${aff.numero}`);
        }
        if (pm) {
          const aff = affaireById.get(pm.affaire_id);
          if (aff) parts.push(`PM:${aff.numero}`);
        }
      }
      const firstMet = metierById.get(dayAssigns[0].metier_id);
      row.push({
        t: "s",
        v: parts.join("\n"),
        s: {
          font: { bold: true, sz: 9 },
          fill: { fgColor: { rgb: hexFromCss(firstMet?.couleur) } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: BORDER_ALL,
        },
      });
    }

    aoa.push(row);
  }

  if (employes.length === 0) {
    aoa.push([
      { t: "s", v: "Aucun employé.", s: { font: { italic: true, color: { rgb: "9CA3AF" } } } },
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Largeurs colonnes
  ws["!cols"] = [
    { wch: 28 }, // employé
    { wch: 14 }, // métier
    ...days.map(() => ({ wch: 16 })),
  ];

  // Hauteur en-tête
  ws["!rows"] = [{ hpt: 26 }, { hpt: 8 }, { hpt: 28 }];

  // Fusion du titre sur toutes les colonnes
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 + days.length } }];

  // Freeze panes (ligne d'en-tête + 2 premières colonnes)
  ws["!freeze"] = { xSplit: 2, ySplit: 3 };

  return ws;
}

function buildSyntheseSheet(opts: BuildOpts): XLSX.WorkSheet {
  const { weekStart, affaires, assignations, employes, metiers, consommation, chefsById } = opts;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const empById = new Map(employes.map((e) => [e.id, e]));
  const metierById = new Map(metiers.map((m) => [m.id, m]));

  // Affaires actives sur la semaine
  const activeIds = new Set<string>();
  assignations.forEach((a) => activeIds.add(a.affaire_id));
  const activeAffaires = affaires.filter((a) => activeIds.has(a.id));

  // Heures restantes par affaire
  const heuresRestantesByAffaire = new Map<string, number>();
  consommation.forEach((c) => {
    heuresRestantesByAffaire.set(
      c.affaire_id,
      (heuresRestantesByAffaire.get(c.affaire_id) ?? 0) + (c.heures_restantes ?? 0),
    );
  });

  const aoa: Cell[][] = [];

  // Titre
  aoa.push([
    {
      t: "s",
      v: `Synthèse chantier — Semaine ${format(weekStart, "II")} — ${format(weekStart, "d MMM yyyy", { locale: fr })}`,
      s: {
        font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "111827" } },
        alignment: { horizontal: "left", vertical: "center" },
      },
    },
  ]);
  aoa.push([{ t: "s", v: "" }]);

  // En-têtes
  const header: Cell[] = [
    { t: "s", v: "Affaire", s: HEADER_STYLE },
    { t: "s", v: "Chef", s: HEADER_STYLE },
    ...days.map((d) => ({
      t: "s" as const,
      v: format(d, "EEE d MMM", { locale: fr }),
      s: HEADER_STYLE,
    })),
    { t: "s", v: "Total équipe-jours", s: HEADER_STYLE },
    { t: "s", v: "Heures restantes", s: HEADER_STYLE },
  ];
  aoa.push(header);

  for (const aff of activeAffaires) {
    const chef = aff.chef_chantier_id ? chefsById.get(aff.chef_chantier_id) : null;
    let totalDemi = 0;

    const dayCells: Cell[] = days.map((d) => {
      const dStr = format(d, "yyyy-MM-dd");
      const dayAssigns = assignations.filter((a) => a.affaire_id === aff.id && a.date === dStr);
      if (dayAssigns.length === 0) return cellEmpty();

      // Liste des employés (initiales) groupés par métier
      const byMetier = new Map<number, string[]>();
      let demi = 0;
      for (const a of dayAssigns) {
        const e = empById.get(a.employe_id);
        if (!e) continue;
        const initials = `${e.prenom[0] ?? ""}${e.nom[0] ?? ""}`.toUpperCase();
        const arr = byMetier.get(a.metier_id) ?? [];
        arr.push(a.demi_journee === "JOURNEE" ? initials : `${initials}(${a.demi_journee})`);
        byMetier.set(a.metier_id, arr);
        demi += a.demi_journee === "JOURNEE" ? 1 : 0.5;
      }
      totalDemi += demi;
      const lines: string[] = [];
      for (const [mid, list] of byMetier.entries()) {
        const m = metierById.get(mid);
        lines.push(`${m?.code ?? "?"}: ${list.join(", ")}`);
      }
      // Couleur du métier dominant
      const dominantMid = [...byMetier.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0];
      const domMet = dominantMid ? metierById.get(dominantMid) : null;
      return {
        t: "s",
        v: lines.join("\n"),
        s: {
          font: { sz: 9 },
          fill: { fgColor: { rgb: hexFromCss(domMet?.couleur) } },
          alignment: { horizontal: "left", vertical: "top", wrapText: true },
          border: BORDER_ALL,
        },
      };
    });

    const restantes = heuresRestantesByAffaire.get(aff.id);
    aoa.push([
      {
        t: "s",
        v: `${aff.numero}\n${aff.nom}`,
        s: { ...NAME_STYLE, alignment: { horizontal: "left", vertical: "center", wrapText: true } },
      },
      { t: "s", v: chef ? `${chef.prenom} ${chef.nom}` : "—", s: SUB_INFO_STYLE },
      ...dayCells,
      {
        t: "n",
        v: totalDemi,
        s: {
          font: { bold: true, sz: 10 },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
          numFmt: "0.0",
        },
      },
      {
        t: restantes != null ? "n" : "s",
        v: restantes != null ? Math.round(restantes) : "—",
        s: {
          font: { bold: true, sz: 10, color: { rgb: restantes != null && restantes < 0 ? "DC2626" : "111827" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
        },
      },
    ]);
  }

  if (activeAffaires.length === 0) {
    aoa.push([
      { t: "s", v: "Aucune affaire staffée cette semaine.", s: { font: { italic: true, color: { rgb: "9CA3AF" } } } },
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 30 }, // affaire
    { wch: 18 }, // chef
    ...days.map(() => ({ wch: 22 })),
    { wch: 12 }, // total
    { wch: 14 }, // restantes
  ];
  ws["!rows"] = [{ hpt: 26 }, { hpt: 8 }, { hpt: 28 }];
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 + days.length } }];
  ws["!freeze"] = { xSplit: 2, ySplit: 3 };
  return ws;
}

function buildHeuresEmployeSheet(employes: Employe[], opts: BuildOpts): XLSX.WorkSheet {
  const { weekStart, assignations, absences, metiers } = opts;
  const metierById = new Map(metiers.map((m) => [m.id, m]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dayStrs = days.map((d) => format(d, "yyyy-MM-dd"));
  // Capacité hebdo de référence = 5 jours ouvrés × 7h = 35h (base CDI)
  const CAPACITE_HEBDO = 35;

  const aoa: Cell[][] = [];

  aoa.push([
    {
      t: "s",
      v: `Heures par employé (CDI/CDD) — Semaine ${format(weekStart, "II")} — ${format(weekStart, "d MMM", { locale: fr })} → ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: fr })}`,
      s: {
        font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "111827" } },
        alignment: { horizontal: "left", vertical: "center" },
      },
    },
  ]);
  aoa.push([{ t: "s", v: "" }]);

  const header: Cell[] = [
    { t: "s", v: "Employé", s: HEADER_STYLE },
    { t: "s", v: "Métier", s: HEADER_STYLE },
    { t: "s", v: "Heures assignées", s: HEADER_STYLE },
    { t: "s", v: "Demi-journées", s: HEADER_STYLE },
    { t: "s", v: "Absences (jours)", s: HEADER_STYLE },
    { t: "s", v: "Capacité (h)", s: HEADER_STYLE },
    { t: "s", v: "Taux d'occupation", s: HEADER_STYLE },
  ];
  aoa.push(header);

  let totalHeures = 0;
  let totalDemi = 0;
  let totalAbsJours = 0;

  for (const emp of employes) {
    const empAssigns = assignations.filter((a) => a.employe_id === emp.id && dayStrs.includes(a.date));
    const heures = empAssigns.reduce((sum, a) => sum + (a.heures ?? 0), 0);
    const demi = empAssigns.reduce(
      (sum, a) => sum + (a.demi_journee === "JOURNEE" ? 1 : 0.5),
      0,
    );

    // Absences : compter les jours (ouvrés ou non) chevauchant la semaine
    let absJours = 0;
    const empAbs = absences.filter((a) => a.employe_id === emp.id);
    for (const dStr of dayStrs) {
      if (empAbs.some((a) => a.date_debut <= dStr && a.date_fin >= dStr)) {
        absJours += 1;
      }
    }

    // Capacité ajustée : retire les jours d'absence de la base (en heures)
    const capaciteAjustee = Math.max(0, CAPACITE_HEBDO - absJours * 7);
    const taux = capaciteAjustee > 0 ? heures / capaciteAjustee : 0;

    totalHeures += heures;
    totalDemi += demi;
    totalAbsJours += absJours;

    const metierEmp = metierById.get(emp.metier_principal_id);
    const tauxColor = taux > 1 ? "DC2626" : taux >= 0.8 ? "16A34A" : taux >= 0.5 ? "CA8A04" : "6B7280";

    aoa.push([
      { t: "s", v: `${emp.prenom} ${emp.nom}`, s: NAME_STYLE },
      {
        t: "s",
        v: metierEmp?.libelle ?? "",
        s: {
          ...SUB_INFO_STYLE,
          fill: { fgColor: { rgb: hexFromCss(metierEmp?.couleur) } },
          font: { sz: 9, bold: true, color: { rgb: "111827" } },
          alignment: { horizontal: "center", vertical: "center" },
        },
      },
      {
        t: "n",
        v: heures,
        s: {
          font: { sz: 10 },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
          numFmt: "0.0",
        },
      },
      {
        t: "n",
        v: demi,
        s: {
          font: { sz: 10 },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
          numFmt: "0.0",
        },
      },
      {
        t: "n",
        v: absJours,
        s: {
          font: { sz: 10, color: { rgb: absJours > 0 ? "6B7280" : "111827" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
        },
      },
      {
        t: "n",
        v: capaciteAjustee,
        s: {
          font: { sz: 10, color: { rgb: "6B7280" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
          numFmt: "0",
        },
      },
      {
        t: "n",
        v: taux,
        s: {
          font: { bold: true, sz: 10, color: { rgb: tauxColor } },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
          numFmt: "0.0%",
        },
      },
    ]);
  }

  // Ligne total
  if (employes.length > 0) {
    const capaciteTotale = Math.max(0, employes.length * CAPACITE_HEBDO - totalAbsJours * 7);
    const tauxGlobal = capaciteTotale > 0 ? totalHeures / capaciteTotale : 0;
    aoa.push([
      {
        t: "s",
        v: `TOTAL (${employes.length} pers.)`,
        s: {
          font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1F2937" } },
          alignment: { horizontal: "left", vertical: "center" },
          border: BORDER_ALL,
        },
      },
      { t: "s", v: "", s: { fill: { fgColor: { rgb: "1F2937" } }, border: BORDER_ALL } },
      {
        t: "n",
        v: totalHeures,
        s: {
          font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1F2937" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
          numFmt: "0.0",
        },
      },
      {
        t: "n",
        v: totalDemi,
        s: {
          font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1F2937" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
          numFmt: "0.0",
        },
      },
      {
        t: "n",
        v: totalAbsJours,
        s: {
          font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1F2937" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
        },
      },
      {
        t: "n",
        v: capaciteTotale,
        s: {
          font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1F2937" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
          numFmt: "0",
        },
      },
      {
        t: "n",
        v: tauxGlobal,
        s: {
          font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1F2937" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: BORDER_ALL,
          numFmt: "0.0%",
        },
      },
    ]);
  } else {
    aoa.push([
      { t: "s", v: "Aucun employé CDI/CDD.", s: { font: { italic: true, color: { rgb: "9CA3AF" } } } },
    ]);
  }

  // Légende
  aoa.push([{ t: "s", v: "" }]);
  aoa.push([
    {
      t: "s",
      v: "Capacité de référence : 35h/semaine (5j × 7h), ajustée selon les jours d'absence (-7h/jour). Vert ≥ 80%, Orange ≥ 50%, Rouge > 100%.",
      s: { font: { italic: true, sz: 9, color: { rgb: "6B7280" } } },
    },
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 28 }, // employé
    { wch: 16 }, // métier
    { wch: 16 }, // heures
    { wch: 14 }, // demi
    { wch: 16 }, // absences
    { wch: 14 }, // capacité
    { wch: 18 }, // taux
  ];
  ws["!rows"] = [{ hpt: 26 }, { hpt: 8 }, { hpt: 28 }];
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  ws["!freeze"] = { xSplit: 2, ySplit: 3 };
  return ws;
}

export function exportPlanningExcel(opts: BuildOpts): void {
  const { employes, assignations, weekStart } = opts;

  const cdiCdd = employes.filter((e) => e.type_contrat === "CDI" || e.type_contrat === "CDD");
  const assignedIds = new Set(assignations.map((a) => a.employe_id));
  const interim = employes.filter(
    (e) => (e.type_contrat === "Interim" || e.type_contrat === "Independant") && assignedIds.has(e.id),
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildEmployeSheet("CDI / CDD", cdiCdd, opts), "CDI-CDD");
  XLSX.utils.book_append_sheet(wb, buildEmployeSheet("Intérim / Indép.", interim, opts), "Intérim");
  XLSX.utils.book_append_sheet(wb, buildSyntheseSheet(opts), "Synthèse chantier");
  XLSX.utils.book_append_sheet(wb, buildHeuresEmployeSheet(cdiCdd, opts), "Heures par employé");

  const filename = `planning-S${format(weekStart, "II")}-${format(weekStart, "yyyy-MM-dd")}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Export d'une plage de semaines (1 à 4) — un groupe de 4 feuilles par semaine,
 * suffixées par S{numéro de semaine}.
 */
export function exportPlanningExcelRange(
  opts: Omit<BuildOpts, "weekStart"> & { weekStarts: Date[] },
): void {
  const { weekStarts, employes, assignations, absences, ...rest } = opts;
  if (weekStarts.length === 0) return;

  const wb = XLSX.utils.book_new();
  const cdiCdd = employes.filter((e) => e.type_contrat === "CDI" || e.type_contrat === "CDD");

  for (const weekStart of weekStarts) {
    const weekEnd = addDays(weekStart, 6);
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");
    const weekNum = format(weekStart, "II");

    const assignsWeek = assignations.filter((a) => a.date >= weekStartStr && a.date <= weekEndStr);
    const absencesWeek = absences.filter(
      (a) => a.date_debut <= weekEndStr && a.date_fin >= weekStartStr,
    );
    const assignedIds = new Set(assignsWeek.map((a) => a.employe_id));
    const interim = employes.filter(
      (e) =>
        (e.type_contrat === "Interim" || e.type_contrat === "Independant") &&
        assignedIds.has(e.id),
    );

    const weekOpts: BuildOpts = {
      ...rest,
      employes,
      assignations: assignsWeek,
      absences: absencesWeek,
      weekStart,
    };

    XLSX.utils.book_append_sheet(
      wb,
      buildEmployeSheet("CDI / CDD", cdiCdd, weekOpts),
      `S${weekNum} CDI-CDD`,
    );
    XLSX.utils.book_append_sheet(
      wb,
      buildEmployeSheet("Intérim / Indép.", interim, weekOpts),
      `S${weekNum} Intérim`,
    );
    XLSX.utils.book_append_sheet(wb, buildSyntheseSheet(weekOpts), `S${weekNum} Synthèse`);
    XLSX.utils.book_append_sheet(
      wb,
      buildHeuresEmployeSheet(cdiCdd, weekOpts),
      `S${weekNum} Heures`,
    );
  }

  const first = weekStarts[0];
  const last = weekStarts[weekStarts.length - 1];
  const filename =
    weekStarts.length === 1
      ? `planning-S${format(first, "II")}-${format(first, "yyyy-MM-dd")}.xlsx`
      : `planning-S${format(first, "II")}-a-S${format(last, "II")}-${format(first, "yyyy-MM-dd")}.xlsx`;
  XLSX.writeFile(wb, filename);
}
