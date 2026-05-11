import * as XLSX from "xlsx-js-style";
import { format, getISOWeek, getISOWeekYear, startOfISOWeek } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Ligne brute issue de la requête Supabase pour l'export SILAE.
 * Une ligne = une saisie d'heures (employé × jour × affaire).
 */
export interface HeuresExportRow {
  id: string;
  date: string; // YYYY-MM-DD
  heure_debut: string | null;
  heure_fin: string | null;
  heures_reelles: number | null;
  heures_nuit: number | null;
  commentaire: string | null;
  statut: string;
  valide_le: string | null;
  motif_rejet: string | null;
  employe: {
    prenom: string;
    nom: string;
    type_contrat: string | null;
    metier_principal: { libelle: string } | null;
    profile: { matricule_silae: string | null } | null;
  } | null;
  affaire: {
    numero: string;
    nom: string;
    lieu: string | null;
    phase: string | null;
  } | null;
  assignation: {
    metier: { libelle: string } | null;
  } | null;
  valideur: { full_name: string | null; email: string } | null;
  devis_id: string | null;
}

export interface HeuresExportOpts {
  weekStart: Date;
  weekEnd: Date;
}

const JOURS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/** Jours fériés FR — Phase 1 : table statique simple, à étendre si besoin. */
const JOURS_FERIES_FR_FIXES: { mois: number; jour: number }[] = [
  { mois: 1, jour: 1 }, // Jour de l'an
  { mois: 5, jour: 1 }, // Fête du travail
  { mois: 5, jour: 8 }, // Victoire 1945
  { mois: 7, jour: 14 }, // Fête nationale
  { mois: 8, jour: 15 }, // Assomption
  { mois: 11, jour: 1 }, // Toussaint
  { mois: 11, jour: 11 }, // Armistice
  { mois: 12, jour: 25 }, // Noël
];

/** Calcul Pâques (algo de Butcher) → renvoie [mois, jour] (1-indexed). */
function paques(annee: number): [number, number] {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return [mois, jour];
}

function joursFeriesAnnee(annee: number): Set<string> {
  const set = new Set<string>();
  for (const { mois, jour } of JOURS_FERIES_FR_FIXES) {
    set.add(`${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`);
  }
  // Pâques + Lundi de Pâques + Ascension (+39j) + Pentecôte (+49j) + Lundi Pentecôte (+50j)
  const [mP, jP] = paques(annee);
  const paquesDate = new Date(annee, mP - 1, jP);
  const offsets = [1, 39, 49, 50]; // Lundi Pâques, Ascension, Pentecôte, Lundi Pentecôte
  for (const off of offsets) {
    const d = new Date(paquesDate);
    d.setDate(d.getDate() + off);
    set.add(format(d, "yyyy-MM-dd"));
  }
  return set;
}

const _feriesCache = new Map<number, Set<string>>();
function isFerie(dateStr: string): boolean {
  const annee = Number(dateStr.slice(0, 4));
  if (!_feriesCache.has(annee)) _feriesCache.set(annee, joursFeriesAnnee(annee));
  return _feriesCache.get(annee)!.has(dateStr);
}

function categorieContrat(t: string | null | undefined): string {
  switch (t) {
    case "CDI":
      return "CDI";
    case "CDD":
      return "CDD";
    case "Interim":
      return "Intermittent";
    case "Independant":
      return "Indépendant";
    default:
      return t ?? "";
  }
}

function phaseLabel(p: string | null | undefined): string {
  if (p === "opportunite") return "Opportunité";
  if (p === "signe") return "Signée";
  return "";
}

function statutLabel(s: string): string {
  switch (s) {
    case "valide":
      return "Validée";
    case "rejete":
      return "Rejetée";
    case "soumis":
      return "En attente";
    case "brouillon":
      return "Brouillon";
    default:
      return s;
  }
}

function isoWeekKey(date: Date): string {
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, "0")}`;
}

function nombreFr(n: number, decimals = 2): string {
  return n.toFixed(decimals).replace(".", ",");
}

interface FlatRow {
  matricule: string;
  nom: string;
  prenom: string;
  categorie: string;
  date: string; // JJ/MM/AAAA
  semaine_iso: string;
  jour: string;
  mois: number;
  annee: number;
  code_affaire: string;
  phase: string;
  chantier: string;
  adresse: string;
  poste_affecte: string;
  metier_principal: string;
  proto: string;
  heures_totales: number;
  heures_jour: number;
  heures_nuit: number;
  heures_dimanche: number;
  heures_ferie: number;
  type_absence: string;
  commentaire_employe: string;
  commentaire_chef: string;
  statut: string;
  chef_valideur: string;
  date_validation: string;
  devis_id: string;
}

function aplatir(rows: HeuresExportRow[]): FlatRow[] {
  return rows.map((r) => {
    const dateObj = new Date(r.date + "T00:00:00");
    const dow = dateObj.getDay();
    const isDimanche = dow === 0;
    const isHoliday = isFerie(r.date);
    const heuresTotales = Number(r.heures_reelles ?? 0);
    const heuresNuit = Number(r.heures_nuit ?? 0);
    const heuresJour = Math.max(0, heuresTotales - heuresNuit);

    return {
      matricule: r.employe?.profile?.matricule_silae ?? "",
      nom: r.employe?.nom ?? "",
      prenom: r.employe?.prenom ?? "",
      categorie: categorieContrat(r.employe?.type_contrat),
      date: format(dateObj, "dd/MM/yyyy"),
      semaine_iso: isoWeekKey(dateObj),
      jour: JOURS_FR[dow],
      mois: dateObj.getMonth() + 1,
      annee: dateObj.getFullYear(),
      code_affaire: r.affaire?.numero ?? "",
      phase: phaseLabel(r.affaire?.phase),
      chantier: r.affaire?.nom ?? "",
      adresse: r.affaire?.lieu ?? "",
      poste_affecte:
        r.assignation?.metier?.libelle ?? r.employe?.metier_principal?.libelle ?? "",
      metier_principal: r.employe?.metier_principal?.libelle ?? "",
      proto: r.affaire?.phase === "opportunite" ? "TRUE" : "FALSE",
      heures_totales: heuresTotales,
      heures_jour: heuresJour,
      heures_nuit: heuresNuit,
      heures_dimanche: isDimanche ? heuresTotales : 0,
      heures_ferie: isHoliday ? heuresTotales : 0,
      type_absence: "", // Phase 1 : non géré ici (les absences ont leur propre table)
      commentaire_employe: r.commentaire ?? "",
      commentaire_chef: r.motif_rejet ?? "",
      statut: statutLabel(r.statut),
      chef_valideur: r.valideur?.full_name ?? r.valideur?.email ?? "",
      date_validation: r.valide_le ? format(new Date(r.valide_le), "dd/MM/yyyy HH:mm") : "",
      devis_id: r.devis_id ?? "",
    };
  });
}

const COLONNES: { key: keyof FlatRow; label: string; isNumber?: boolean }[] = [
  { key: "matricule", label: "Matricule SILAE" },
  { key: "nom", label: "Nom" },
  { key: "prenom", label: "Prénom" },
  { key: "categorie", label: "Catégorie" },
  { key: "date", label: "Date" },
  { key: "semaine_iso", label: "Semaine ISO" },
  { key: "jour", label: "Jour" },
  { key: "mois", label: "Mois", isNumber: true },
  { key: "annee", label: "Année", isNumber: true },
  { key: "code_affaire", label: "Code affaire" },
  { key: "phase", label: "Phase affaire" },
  { key: "chantier", label: "Chantier" },
  { key: "adresse", label: "Adresse chantier" },
  { key: "poste_affecte", label: "Poste affecté" },
  { key: "metier_principal", label: "Métier principal" },
  { key: "proto", label: "Badge PROTO" },
  { key: "heures_totales", label: "Heures totales", isNumber: true },
  { key: "heures_jour", label: "Heures jour", isNumber: true },
  { key: "heures_nuit", label: "Heures nuit", isNumber: true },
  { key: "heures_dimanche", label: "Heures dimanche", isNumber: true },
  { key: "heures_ferie", label: "Heures férié", isNumber: true },
  { key: "type_absence", label: "Type absence" },
  { key: "commentaire_employe", label: "Commentaires employé" },
  { key: "commentaire_chef", label: "Commentaires chef valideur" },
  { key: "statut", label: "Statut" },
  { key: "chef_valideur", label: "Chef valideur" },
  { key: "date_validation", label: "Date validation" },
  { key: "devis_id", label: "Devis_id" },
];

function escapeCsv(v: string): string {
  if (v.includes(";") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function buildCsv(flat: FlatRow[]): string {
  const header = COLONNES.map((c) => escapeCsv(c.label)).join(";");
  const lignes = flat.map((row) =>
    COLONNES.map((c) => {
      const v = row[c.key];
      if (v === null || v === undefined || v === "") return "";
      if (c.isNumber) return nombreFr(Number(v), c.key === "mois" || c.key === "annee" ? 0 : 2);
      return escapeCsv(String(v));
    }).join(";"),
  );
  // BOM UTF-8 pour Excel/SILAE
  return "\uFEFF" + [header, ...lignes].join("\r\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface RecapHebdo {
  matricule: string;
  nom: string;
  prenom: string;
  categorie: string;
  semaine_iso: string;
  total_heures: number;
  total_jour: number;
  total_nuit: number;
  total_dimanche: number;
  total_ferie: number;
  nb_chantiers: number;
}

function buildRecapHebdo(flat: FlatRow[]): RecapHebdo[] {
  const map = new Map<string, RecapHebdo & { _chantiers: Set<string> }>();
  for (const r of flat) {
    const k = `${r.matricule}|${r.nom}|${r.prenom}|${r.semaine_iso}`;
    let acc = map.get(k);
    if (!acc) {
      acc = {
        matricule: r.matricule,
        nom: r.nom,
        prenom: r.prenom,
        categorie: r.categorie,
        semaine_iso: r.semaine_iso,
        total_heures: 0,
        total_jour: 0,
        total_nuit: 0,
        total_dimanche: 0,
        total_ferie: 0,
        nb_chantiers: 0,
        _chantiers: new Set<string>(),
      };
      map.set(k, acc);
    }
    acc.total_heures += r.heures_totales;
    acc.total_jour += r.heures_jour;
    acc.total_nuit += r.heures_nuit;
    acc.total_dimanche += r.heures_dimanche;
    acc.total_ferie += r.heures_ferie;
    if (r.code_affaire) acc._chantiers.add(r.code_affaire);
  }
  return Array.from(map.values())
    .map((a) => {
      a.nb_chantiers = a._chantiers.size;
      const { _chantiers: _omit, ...rest } = a;
      return rest;
    })
    .sort(
      (a, b) =>
        a.semaine_iso.localeCompare(b.semaine_iso) ||
        a.nom.localeCompare(b.nom) ||
        a.prenom.localeCompare(b.prenom),
    );
}

/**
 * Génère 2 fichiers SILAE en parallèle :
 * - CSV UTF-8 avec BOM, séparateur ";", format FR (destiné import SILAE/PROGBAT)
 * - XLSX 2 onglets : "Détail saisies" + "Récap hebdo par employé" (archivage RH)
 */
export async function exportHeuresSilae(rows: HeuresExportRow[], opts: HeuresExportOpts) {
  const flat = aplatir(rows);

  // Nom de fichier basé sur la semaine ISO du début de la plage exportée
  const wkStart = startOfISOWeek(opts.weekStart);
  const semaine = getISOWeek(wkStart);
  const annee = getISOWeekYear(wkStart);
  const today = format(new Date(), "yyyyMMdd");
  const baseName = `staffing-heures-semaine-${String(semaine).padStart(2, "0")}-${annee}-${today}`;

  // 1. CSV
  const csv = buildCsv(flat);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${baseName}.csv`);

  // 2. XLSX 2 onglets
  const wb = XLSX.utils.book_new();

  // Onglet 1 : détail
  const detailData = flat.map((r) => {
    const obj: Record<string, string | number> = {};
    for (const c of COLONNES) {
      const v = r[c.key];
      obj[c.label] = c.isNumber ? Number(v ?? 0) : (v as string) ?? "";
    }
    return obj;
  });
  const wsDetail = XLSX.utils.json_to_sheet(detailData);
  wsDetail["!cols"] = COLONNES.map((c) => ({
    wch: Math.min(Math.max(c.label.length + 2, 10), 30),
  }));
  XLSX.utils.book_append_sheet(wb, wsDetail, "Détail saisies");

  // Onglet 2 : récap hebdo par employé
  const recap = buildRecapHebdo(flat);
  const recapData = recap.map((r) => ({
    "Matricule SILAE": r.matricule,
    Nom: r.nom,
    Prénom: r.prenom,
    Catégorie: r.categorie,
    "Semaine ISO": r.semaine_iso,
    "Total heures": r.total_heures,
    "Heures jour": r.total_jour,
    "Heures nuit": r.total_nuit,
    "Heures dimanche": r.total_dimanche,
    "Heures férié": r.total_ferie,
    "Nb chantiers": r.nb_chantiers,
  }));
  const wsRecap = XLSX.utils.json_to_sheet(recapData);
  wsRecap["!cols"] = [
    { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRecap, "Récap hebdo par employé");

  XLSX.writeFile(wb, `${baseName}.xlsx`);

  return { count: flat.length, filename: baseName };
}

// Conserver l'ancien nom pour rétro-compatibilité éventuelle
export const exportHeuresXlsx = exportHeuresSilae;

// ============================================================================
// Validation schéma SILAE
// ============================================================================

export type SilaeErrorCode =
  | "MISSING_MATRICULE"
  | "MISSING_NOM"
  | "MISSING_PRENOM"
  | "MISSING_CATEGORIE"
  | "MISSING_DATE"
  | "INVALID_DATE"
  | "MISSING_CODE_AFFAIRE"
  | "MISSING_HEURES"
  | "INVALID_HEURES"
  | "NUIT_GT_TOTAL"
  | "STATUT_NON_VALIDE";

export interface SilaeValidationError {
  rowIndex: number; // index 0-based dans rows
  code: SilaeErrorCode;
  field: string;
  message: string;
  context: {
    date: string;
    employe: string;
    affaire: string;
  };
}

export interface SilaeValidationReport {
  ok: boolean;
  totalRows: number;
  errorRows: number;
  warningRows: number;
  errors: SilaeValidationError[]; // bloquants
  warnings: SilaeValidationError[]; // non bloquants (ex: statut non validé)
}

const SILAE_ERROR_LABELS: Record<SilaeErrorCode, string> = {
  MISSING_MATRICULE: "Matricule SILAE manquant",
  MISSING_NOM: "Nom manquant",
  MISSING_PRENOM: "Prénom manquant",
  MISSING_CATEGORIE: "Catégorie de contrat manquante",
  MISSING_DATE: "Date manquante",
  INVALID_DATE: "Date invalide",
  MISSING_CODE_AFFAIRE: "Code affaire manquant",
  MISSING_HEURES: "Heures totales manquantes",
  INVALID_HEURES: "Heures totales invalides (≤ 0 ou non numériques)",
  NUIT_GT_TOTAL: "Heures de nuit supérieures aux heures totales",
  STATUT_NON_VALIDE: "Saisie non validée (sera transmise à SILAE en l'état)",
};

/**
 * Valide les lignes contre le schéma SILAE attendu.
 * Renvoie un rapport listant les erreurs ligne par ligne.
 * - errors  : champs requis manquants ou incohérents → bloquants par défaut
 * - warnings: incohérences souples (statut non validé) → non bloquants
 */
export function validateHeuresForSilae(rows: HeuresExportRow[]): SilaeValidationReport {
  const errors: SilaeValidationError[] = [];
  const warnings: SilaeValidationError[] = [];
  const errorRowSet = new Set<number>();
  const warnRowSet = new Set<number>();

  rows.forEach((r, i) => {
    const ctx = {
      date: r.date ?? "",
      employe: r.employe ? `${r.employe.prenom} ${r.employe.nom}` : "—",
      affaire: r.affaire ? `${r.affaire.numero} ${r.affaire.nom}` : "—",
    };
    const push = (code: SilaeErrorCode, field: string, target: "err" | "warn" = "err") => {
      const entry: SilaeValidationError = {
        rowIndex: i,
        code,
        field,
        message: SILAE_ERROR_LABELS[code],
        context: ctx,
      };
      if (target === "err") {
        errors.push(entry);
        errorRowSet.add(i);
      } else {
        warnings.push(entry);
        warnRowSet.add(i);
      }
    };

    if (!r.employe?.profile?.matricule_silae?.trim()) push("MISSING_MATRICULE", "matricule_silae");
    if (!r.employe?.nom?.trim()) push("MISSING_NOM", "nom");
    if (!r.employe?.prenom?.trim()) push("MISSING_PRENOM", "prenom");
    if (!r.employe?.type_contrat) push("MISSING_CATEGORIE", "type_contrat");

    if (!r.date) {
      push("MISSING_DATE", "date");
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(new Date(r.date + "T00:00:00").getTime())) {
      push("INVALID_DATE", "date");
    }

    if (!r.affaire?.numero?.trim()) push("MISSING_CODE_AFFAIRE", "affaire.numero");

    const h = r.heures_reelles;
    if (h === null || h === undefined) {
      push("MISSING_HEURES", "heures_reelles");
    } else if (typeof h !== "number" || Number.isNaN(h) || h <= 0) {
      push("INVALID_HEURES", "heures_reelles");
    } else {
      const nuit = Number(r.heures_nuit ?? 0);
      if (nuit > h + 0.001) push("NUIT_GT_TOTAL", "heures_nuit");
    }

    if (r.statut !== "valide") push("STATUT_NON_VALIDE", "statut", "warn");
  });

  return {
    ok: errors.length === 0,
    totalRows: rows.length,
    errorRows: errorRowSet.size,
    warningRows: warnRowSet.size,
    errors,
    warnings,
  };
}

export const SILAE_ERROR_LABELS_EXPORT = SILAE_ERROR_LABELS;

// Export utilitaire pour tests
export const _internals = {
  isFerie,
  paques,
  buildCsv,
  buildRecapHebdo,
  aplatir,
  isoWeekKey,
  joursFeriesAnnee,
  COLONNES,
};

// date-fns/locale est utilisé indirectement (réservé pour évolutions futures)
void fr;
