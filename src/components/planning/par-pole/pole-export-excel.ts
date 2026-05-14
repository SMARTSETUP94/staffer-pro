import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { PoleCellRow, PoleCapacite } from "@/hooks/use-planning-par-pole";

interface Args {
  chantiers: Array<{ id: string; numero: string; nom: string; typologie: string | null; statut: string }>;
  metiers: PoleCapacite[];
  capacites: PoleCapacite[];
  cellMap: Map<string, PoleCellRow>;
  weekStart: Date;
  weekEnd: Date;
}

export async function exportPoleMatriceXlsx({ chantiers, metiers, cellMap, weekStart, weekEnd }: Args) {
  const XLSX = await import("xlsx-js-style");

  // Feuille 1 : matrice
  const header = ["Chantier", "Nom", ...metiers.map((m) => `${m.metier_libelle} (pers)`), ...metiers.map((m) => `${m.metier_libelle} (h)`)];
  const matriceRows: (string | number)[][] = [header];
  for (const ch of chantiers) {
    const row: (string | number)[] = [ch.numero, ch.nom];
    for (const m of metiers) {
      const c = cellMap.get(`${ch.id}::${m.metier_id}`);
      row.push(c ? c.nb_personnes : 0);
    }
    for (const m of metiers) {
      const c = cellMap.get(`${ch.id}::${m.metier_id}`);
      row.push(c ? Number(c.total_heures) : 0);
    }
    matriceRows.push(row);
  }

  // Feuille 2 : détail par personne (requête live)
  const { data } = await supabase
    .from("assignations")
    .select("date, affaire_id, metier_id, employes!inner(prenom, nom, type_contrat, metier_principal_id), affaires!inner(numero, nom)")
    .gte("date", format(weekStart, "yyyy-MM-dd"))
    .lte("date", format(weekEnd, "yyyy-MM-dd"));

  const detail: (string | number)[][] = [
    ["Chantier", "Nom chantier", "Métier", "Personne", "Contrat", "Date"],
  ];
  const metierLabel = new Map(metiers.map((m) => [m.metier_id, m.metier_libelle]));
  for (const r of (data ?? []) as Array<{
    date: string;
    metier_id: number | null;
    employes: { prenom: string | null; nom: string | null; type_contrat: string | null; metier_principal_id: number | null };
    affaires: { numero: string; nom: string };
  }>) {
    const mid = r.metier_id ?? r.employes?.metier_principal_id;
    if (mid == null) continue;
    detail.push([
      r.affaires.numero,
      r.affaires.nom,
      metierLabel.get(mid) ?? `Métier ${mid}`,
      `${r.employes.prenom ?? ""} ${r.employes.nom ?? ""}`.trim(),
      r.employes.type_contrat ?? "",
      r.date,
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(matriceRows);
  const ws2 = XLSX.utils.aoa_to_sheet(detail);
  XLSX.utils.book_append_sheet(wb, ws1, "Matrice par pôle");
  XLSX.utils.book_append_sheet(wb, ws2, "Détail par personne");

  const filename = `planning-par-pole_${format(weekStart, "yyyy-MM-dd")}_${format(weekEnd, "yyyy-MM-dd")}.xlsx`;
  XLSX.writeFile(wb, filename);
}
