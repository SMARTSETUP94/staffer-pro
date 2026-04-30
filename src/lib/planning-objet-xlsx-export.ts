/**
 * Export Excel matriciel « Planning par objet » :
 * Lignes = objets de fabrication (groupés par affaire)
 * Colonnes = jours de la semaine
 * Contenu de cellule = liste « Prénom NOM (Xh) » + total heures cellule
 *
 * Utilisé depuis l'onglet « Planning par objet » de /planning.
 */
import * as XLSX from "xlsx-js-style";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import type { Affaire, Assignation, Employe } from "@/hooks/use-planning-data";

interface FabObjetRow {
  id: string;
  affaire_id: string;
  reference: string;
  nom: string;
  ordre: number;
  heures_prevues_total: number;
}

export interface ExportPlanningObjetOptions {
  weekStart: Date;
  showWeekend?: boolean;
  affaires: Affaire[];
  employes: Employe[];
  assignations: Assignation[];
  filterAffaireIds?: Set<string>;
  filterMetierIds?: Set<number>;
}

export async function exportPlanningParObjetToXlsx(
  opts: ExportPlanningObjetOptions,
): Promise<Blob> {
  const { weekStart, showWeekend = false, affaires, employes, assignations } = opts;
  const days = Array.from(
    { length: showWeekend ? 7 : 5 },
    (_, i) => addDays(weekStart, i),
  );

  // Affaires retenues (filtre + actives sur la semaine)
  const presentAffIds = new Set<string>();
  assignations.forEach((a) => presentAffIds.add(a.affaire_id));
  let affList = affaires.filter((a) => presentAffIds.has(a.id));
  if (opts.filterAffaireIds && opts.filterAffaireIds.size > 0) {
    affList = affList.filter((a) => opts.filterAffaireIds!.has(a.id));
  }
  affList.sort((a, b) => a.numero.localeCompare(b.numero));

  // Charge les objets
  const objets: FabObjetRow[] = [];
  if (affList.length > 0) {
    const { data, error } = await supabase
      .from("fabrication_objets")
      .select(
        "id, affaire_id, reference, nom, ordre, created_at, quantite, heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention",
      )
      .in("affaire_id", affList.map((a) => a.id))
      .eq("archive", false)
      .order("affaire_id", { ascending: true })
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    for (const o of data ?? []) {
      const qte = Number(o.quantite ?? 1) || 1;
      const totalUnit =
        Number(o.heures_prevues_be ?? 0) +
        Number(o.heures_prevues_numerique ?? 0) +
        Number(o.heures_prevues_bois ?? 0) +
        Number(o.heures_prevues_metal ?? 0) +
        Number(o.heures_prevues_peinture ?? 0) +
        Number(o.heures_prevues_tapisserie ?? 0) +
        Number(o.heures_prevues_manutention ?? 0);
      objets.push({
        id: o.id,
        affaire_id: o.affaire_id,
        reference: o.reference,
        nom: o.nom,
        ordre: o.ordre ?? 0,
        heures_prevues_total: totalUnit * qte,
      });
    }
  }

  // Charge les liens assignation_objets
  const assignIds = assignations.map((a) => a.id);
  const links: Array<{ assignation_id: string; objet_id: string }> = [];
  if (assignIds.length > 0) {
    const { data, error } = await supabase
      .from("assignation_objets")
      .select("assignation_id, objet_id")
      .in("assignation_id", assignIds);
    if (error) throw new Error(error.message);
    links.push(...(data ?? []));
  }

  // Index utilitaires
  const assignById = new Map<string, Assignation>(
    assignations.map((a) => [a.id, a]),
  );
  const employesById = new Map<string, Employe>(employes.map((e) => [e.id, e]));

  // Map (objet_id, dateStr) -> Assignation[]
  const cellMap = new Map<string, Assignation[]>();
  for (const lk of links) {
    const a = assignById.get(lk.assignation_id);
    if (!a) continue;
    if (
      opts.filterMetierIds &&
      opts.filterMetierIds.size > 0 &&
      !opts.filterMetierIds.has(a.metier_id)
    ) {
      continue;
    }
    const key = `${lk.objet_id}::${a.date}`;
    const arr = cellMap.get(key) ?? [];
    arr.push(a);
    cellMap.set(key, arr);
  }

  // Total assigné par objet (pour colonne Δ)
  const assignedByObjet = new Map<string, number>();
  for (const lk of links) {
    const a = assignById.get(lk.assignation_id);
    if (!a) continue;
    assignedByObjet.set(
      lk.objet_id,
      (assignedByObjet.get(lk.objet_id) ?? 0) + Number(a.heures || 0),
    );
  }

  // Construction des lignes (header + groupes)
  const dayHeaders = days.map((d) => format(d, "EEE dd/MM", { locale: fr }));
  const aoa: (string | number | null)[][] = [];

  // Ligne titre
  aoa.push([
    `Planning par objet — Semaine du ${format(weekStart, "dd/MM/yyyy")}`,
  ]);
  aoa.push([]);

  // En-têtes
  const headerRow = [
    "Affaire",
    "Objet (réf.)",
    "Nom de l'objet",
    ...dayHeaders,
    "Total semaine (h)",
    "Prévues devis (h)",
    "Écart (h)",
  ];
  aoa.push(headerRow);

  // Données : pour chaque affaire, ligne séparateur + lignes objets
  const objetsByAffaire = new Map<string, FabObjetRow[]>();
  for (const o of objets) {
    const arr = objetsByAffaire.get(o.affaire_id) ?? [];
    arr.push(o);
    objetsByAffaire.set(o.affaire_id, arr);
  }

  for (const af of affList) {
    const objs = objetsByAffaire.get(af.id) ?? [];
    if (objs.length === 0) continue;

    // Ligne groupe affaire
    aoa.push([`${af.numero} — ${af.nom}`, "", "", ...dayHeaders.map(() => ""), "", "", ""]);

    for (const obj of objs) {
      const row: (string | number | null)[] = [
        af.numero,
        obj.reference,
        obj.nom,
      ];
      let totalSemaine = 0;
      for (const d of days) {
        const key = `${obj.id}::${format(d, "yyyy-MM-dd")}`;
        const cellAssigns = cellMap.get(key) ?? [];
        if (cellAssigns.length === 0) {
          row.push("");
          continue;
        }
        // Group par employé
        const byEmp = new Map<string, number>();
        for (const a of cellAssigns) {
          byEmp.set(
            a.employe_id,
            (byEmp.get(a.employe_id) ?? 0) + Number(a.heures || 0),
          );
        }
        let cellTotal = 0;
        const lines: string[] = [];
        for (const [empId, h] of byEmp) {
          const emp = employesById.get(empId);
          const name = emp ? `${emp.prenom} ${emp.nom}` : "?";
          lines.push(`${name} (${h}h)`);
          cellTotal += h;
        }
        totalSemaine += cellTotal;
        row.push(`${lines.join("\n")}\n= ${cellTotal}h`);
      }
      const prevues = obj.heures_prevues_total;
      const totalGlobalObjet = assignedByObjet.get(obj.id) ?? 0;
      const ecart = totalGlobalObjet - prevues;
      row.push(totalSemaine);
      row.push(prevues || "");
      row.push(prevues > 0 ? ecart : "");
      aoa.push(row);
    }
  }

  if (aoa.length <= 3) {
    aoa.push(["Aucun objet à exporter pour les filtres courants."]);
  }

  // Build worksheet
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Largeurs colonnes
  const widths: { wch: number }[] = [
    { wch: 12 }, // Affaire numéro
    { wch: 18 }, // Réf objet
    { wch: 28 }, // Nom objet
    ...days.map(() => ({ wch: 28 })),
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
  ];
  ws["!cols"] = widths;

  // Wrap text + alignment top sur cellules de données
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;
      cell.s = { alignment: { wrapText: true, vertical: "top" } };
    }
  }

  // Merge ligne titre + lignes groupes affaire
  const merges: XLSX.Range[] = [];
  // Titre fusionné sur toute la largeur
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: headerRow.length - 1 } });
  // Lignes groupes affaires : on les détecte (Affaire contient " — ")
  for (let r = 3; r < aoa.length; r++) {
    const first = aoa[r][0];
    if (typeof first === "string" && first.includes(" — ") && (aoa[r][1] === "" || aoa[r][1] == null)) {
      merges.push({ s: { r, c: 0 }, e: { r, c: headerRow.length - 1 } });
    }
  }
  ws["!merges"] = merges;

  // Hauteur ligne header un peu plus grande
  ws["!rows"] = aoa.map((_, i) => (i === 2 ? { hpt: 28 } : i === 0 ? { hpt: 22 } : {}));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planning par objet");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function buildPlanningObjetXlsxFilename(weekStart: Date): string {
  return `planning-par-objet_${format(weekStart, "yyyy-MM-dd")}.xlsx`;
}
