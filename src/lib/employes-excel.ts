/**
 * v0.42.2 — Export / Import Excel des employés (focus poste_principal).
 *
 * - Export : .xlsx avec Nom, Prénom, Email, Statut contrat, Poste principal,
 *   Taux brut, Taux chargé, Date dernière activité, Chantier récent.
 * - Import inverse : matching insensible aux accents/casse sur "nom + prénom",
 *   diff preview avant UPDATE.
 *
 * Politique xlsx : xlsx-js-style uniquement (lazy-loaded au clic).
 */
import { supabase } from "@/integrations/supabase/client";
import { normalizeName } from "@/lib/string-normalize";

export interface EmployeExportRow {
  id: string;
  nom: string;
  prenom: string;
  email: string | null;
  statut_contrat: string | null;
  poste_principal: string | null;
  taux_horaire_brut: number | null;
  taux_horaire_charge: number | null;
}

export interface EmployeExportEnriched extends EmployeExportRow {
  date_derniere_activite: string | null;
  chantier_recent: string | null;
}

const HEADERS = [
  "Nom",
  "Prénom",
  "Email",
  "Statut contrat",
  "Poste principal",
  "Taux horaire brut (€)",
  "Taux horaire chargé (€)",
  "Date dernière activité",
  "Chantier récent",
] as const;

/** Récupère les employés + leur dernière activité (max(assignations.date)) + chantier le plus récent. */
export async function fetchEmployesForExport(): Promise<EmployeExportEnriched[]> {
  const { data: emps, error } = await supabase
    .from("employes")
    .select("id, nom, prenom, email, statut_contrat, poste_principal, taux_horaire_brut, taux_horaire_charge")
    .eq("actif", true)
    .order("nom", { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);

  const ids = (emps ?? []).map((e) => e.id);
  if (ids.length === 0) return [];

  // Récup dernières assignations (1 par employé)
  const { data: assigns } = await supabase
    .from("assignations")
    .select("employe_id, date, affaires:affaire_id(numero, nom)")
    .in("employe_id", ids)
    .order("date", { ascending: false })
    .limit(5000);

  const lastByEmp = new Map<string, { date: string; chantier: string }>();
  for (const a of (assigns ?? []) as Array<{ employe_id: string; date: string; affaires: { numero: string; nom: string } | null }>) {
    if (lastByEmp.has(a.employe_id)) continue;
    const ch = a.affaires ? `${a.affaires.numero} — ${a.affaires.nom}` : "—";
    lastByEmp.set(a.employe_id, { date: a.date, chantier: ch });
  }

  return (emps ?? []).map((e) => {
    const last = lastByEmp.get(e.id);
    return {
      ...e,
      date_derniere_activite: last?.date ?? null,
      chantier_recent: last?.chantier ?? null,
    } as EmployeExportEnriched;
  });
}

/** Exporte le fichier Excel et déclenche le download navigateur. */
export async function exportEmployesXlsx(rows: EmployeExportEnriched[], filename?: string): Promise<void> {
  const XLSX = (await import("xlsx-js-style")).default;
  const aoa: (string | number | null)[][] = [
    [...HEADERS],
    ...rows.map((r) => [
      r.nom,
      r.prenom,
      r.email ?? "",
      r.statut_contrat ?? "",
      r.poste_principal ?? "",
      r.taux_horaire_brut ?? null,
      r.taux_horaire_charge ?? null,
      r.date_derniere_activite ?? "",
      r.chantier_recent ?? "",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Style entête
  for (let c = 0; c < HEADERS.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[ref]) continue;
    ws[ref].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1F2937" } },
      alignment: { horizontal: "center", vertical: "center" },
    };
  }
  ws["!cols"] = [
    { wch: 18 }, { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 24 },
    { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 36 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employés");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, filename ?? `employes-setup-paris-${today}.xlsx`);
}

export interface ImportPosteRow {
  nom: string;
  prenom: string;
  poste_principal: string;
}

export interface ImportPosteDiff {
  toUpdate: Array<{ id: string; nom: string; prenom: string; ancien: string | null; nouveau: string }>;
  unchanged: Array<{ nom: string; prenom: string; poste: string }>;
  notFound: Array<{ nom: string; prenom: string; poste: string }>;
}

/** Parse un fichier Excel (xlsx) et extrait les colonnes Nom / Prénom / Poste principal. */
export async function parseImportPosteFile(file: File): Promise<ImportPosteRow[]> {
  const XLSX = (await import("xlsx-js-style")).default;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  return json
    .map((row) => {
      const findKey = (label: string) =>
        Object.keys(row).find((k) => normalizeName(k) === normalizeName(label));
      const nomKey = findKey("Nom");
      const prenomKey = findKey("Prénom") ?? findKey("Prenom");
      const posteKey = findKey("Poste principal") ?? findKey("Poste");
      const nom = String(nomKey ? row[nomKey] : "").trim();
      const prenom = String(prenomKey ? row[prenomKey] : "").trim();
      const poste = String(posteKey ? row[posteKey] : "").trim();
      return { nom, prenom, poste_principal: poste };
    })
    .filter((r) => r.nom && r.prenom);
}

/** Compare le fichier importé avec la DB et calcule le diff (idempotent). */
export async function computeImportPosteDiff(rows: ImportPosteRow[]): Promise<ImportPosteDiff> {
  const { data: emps, error } = await supabase
    .from("employes")
    .select("id, nom, prenom, poste_principal")
    .eq("actif", true)
    .limit(2000);
  if (error) throw new Error(error.message);

  const byKey = new Map<string, { id: string; nom: string; prenom: string; poste_principal: string | null }>();
  for (const e of emps ?? []) {
    const key = `${normalizeName(e.nom)} ${normalizeName(e.prenom)}`;
    byKey.set(key, e);
  }

  const diff: ImportPosteDiff = { toUpdate: [], unchanged: [], notFound: [] };
  for (const r of rows) {
    if (!r.poste_principal) continue;
    const key = `${normalizeName(r.nom)} ${normalizeName(r.prenom)}`;
    const match = byKey.get(key);
    if (!match) {
      diff.notFound.push({ nom: r.nom, prenom: r.prenom, poste: r.poste_principal });
      continue;
    }
    const current = (match.poste_principal ?? "").trim();
    if (normalizeName(current) === normalizeName(r.poste_principal)) {
      diff.unchanged.push({ nom: r.nom, prenom: r.prenom, poste: r.poste_principal });
    } else {
      diff.toUpdate.push({
        id: match.id,
        nom: match.nom,
        prenom: match.prenom,
        ancien: current || null,
        nouveau: r.poste_principal,
      });
    }
  }
  return diff;
}

/** Applique les UPDATE en batch (un par employé — RLS chef_or_admin). */
export async function applyImportPosteDiff(diff: ImportPosteDiff): Promise<{ ok: number; ko: number }> {
  let ok = 0;
  let ko = 0;
  for (const row of diff.toUpdate) {
    const { error } = await supabase
      .from("employes")
      .update({ poste_principal: row.nouveau })
      .eq("id", row.id);
    if (error) ko++;
    else ok++;
  }
  return { ok, ko };
}
