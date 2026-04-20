import * as XLSX from "xlsx";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface ExportRow {
  date: string;
  heure_debut: string | null;
  heure_fin: string | null;
  heures_reelles: number | null;
  commentaire: string | null;
  statut: string;
  valide_le: string | null;
  employe: { prenom: string; nom: string } | null;
  affaire: { numero: string; nom: string } | null;
}

interface ExportOpts {
  weekStart: Date;
  weekEnd: Date;
}

export async function exportHeuresXlsx(rows: ExportRow[], opts: ExportOpts) {
  const data = rows.map((r) => ({
    Date: format(new Date(r.date), "dd/MM/yyyy"),
    Jour: format(new Date(r.date), "EEEE", { locale: fr }),
    Employé: r.employe ? `${r.employe.prenom} ${r.employe.nom}` : "—",
    Affaire: r.affaire?.numero ?? "—",
    Libellé: r.affaire?.nom ?? "",
    "Heure début": r.heure_debut?.slice(0, 5) ?? "",
    "Heure fin": r.heure_fin?.slice(0, 5) ?? "",
    "Heures réelles": Number(r.heures_reelles ?? 0),
    Commentaire: r.commentaire ?? "",
    Statut: r.statut,
    "Validé le": r.valide_le ? format(new Date(r.valide_le), "dd/MM/yyyy HH:mm") : "",
  }));

  const totalHeures = data.reduce((acc, d) => acc + d["Heures réelles"], 0);
  data.push({
    Date: "",
    Jour: "",
    Employé: "TOTAL",
    Affaire: "",
    Libellé: "",
    "Heure début": "",
    "Heure fin": "",
    "Heures réelles": totalHeures,
    Commentaire: "",
    Statut: "",
    "Validé le": "",
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 30 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 10 }, { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Heures validées");

  const filename = `heures-validees-${format(opts.weekStart, "yyyy-MM-dd")}-${format(opts.weekEnd, "yyyy-MM-dd")}.xlsx`;
  XLSX.writeFile(wb, filename);
}
