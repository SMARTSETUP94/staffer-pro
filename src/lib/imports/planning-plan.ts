/**
 * LOT 8 — Construction du plan d'import (module PUR, testable).
 *
 * Transforme les lignes parsées du classeur en opérations à appliquer :
 * affaires, objets, heures prévues (jours-hommes → heures), effectif
 * prévisionnel `atelier_planning` et affectations nominatives.
 */
import { makeIssue, type ImportIssue } from "@/lib/import-validation";
import {
  HEURES_PAR_PERSONNE_JOUR, classifyLivraisonType, normLabel,
  type ParsedPlanning,
} from "@/lib/imports/planning-xlsx";

export type OrigineHeures = "ajout" | "devis";
/** Que faire quand une ligne d'heures existe déjà pour (objet, métier). */
export type HeuresConflictMode = "replace" | "cumulate";

export interface PlanBuildContext {
  /** numéro d'affaire → affaire existante. */
  affairesByCode: Map<string, { id: string; nom: string }>;
  /** prénom normalisé → employés candidats. */
  employesByPrenom: Map<string, { id: string; prenom: string; nom: string; metier_principal_id: number | null }[]>;
  origine?: OrigineHeures;
  /** Importer les affectations nominatives (cases Équipe 1/2/3 + onglet). */
  withAffectations?: boolean;
}

export interface PlanAffaire {
  code: string;
  nom: string;
  existingId: string | null;
  montage: {
    date_montage?: string | null;
    date_demontage?: string | null;
    montage_nb_techniciens?: number | null;
    montage_travail_nuit?: boolean;
    montage_nb_semi?: number | null;
    montage_nb_20m3?: number | null;
    montage_nature_prestation?: string | null;
    montage_notes?: string | null;
  } | null;
}

export interface PlanObjet {
  code: string;
  nom: string;
}

export interface PlanHeures {
  code: string;
  element: string;
  metierId: number;
  heures: number;
  note: string | null;
  sousTraitance: boolean;
  origine: OrigineHeures;
}

export interface PlanPlanning {
  code: string;
  element: string;
  metierId: number;
  date: string;
  nbPers: number;
  note: string | null;
}

export interface PlanAffectation {
  code: string;
  element: string;
  metierId: number;
  date: string;
  employeId: string;
  prenom: string;
}

export interface PlanningPlan {
  affaires: PlanAffaire[];
  objets: PlanObjet[];
  heures: PlanHeures[];
  planning: PlanPlanning[];
  affectations: PlanAffectation[];
  /** Prénoms d'équipe non résolus (aucun ou plusieurs employés candidats). */
  prenomsNonResolus: string[];
  issues: ImportIssue[];
  totals: {
    affaires: number;
    affairesACreer: number;
    objets: number;
    lignesHeures: number;
    lignesPlanning: number;
    affectations: number;
    joursHommes: number;
  };
}

const clampNbPers = (n: number) => Math.max(1, Math.min(30, Math.round(n)));

export function buildPlanningPlan(parsed: ParsedPlanning, ctx: PlanBuildContext): PlanningPlan {
  const origine: OrigineHeures = ctx.origine ?? "ajout";
  const issues: ImportIssue[] = [...parsed.issues];

  const affaires = new Map<string, PlanAffaire>();
  const objets = new Map<string, PlanObjet>();
  const heures = new Map<string, PlanHeures & { taches: Set<string> }>();
  const planning = new Map<string, PlanPlanning>();
  const affectations = new Map<string, PlanAffectation>();
  const nonResolus = new Set<string>();
  let joursHommes = 0;

  const touchAffaire = (code: string, nom: string) => {
    const existing = affaires.get(code);
    if (existing) {
      if (!existing.nom && nom) existing.nom = nom;
      return existing;
    }
    const known = ctx.affairesByCode.get(code);
    const entry: PlanAffaire = {
      code,
      nom: known?.nom || nom || `Chantier ${code}`,
      existingId: known?.id ?? null,
      montage: null,
    };
    affaires.set(code, entry);
    return entry;
  };

  /* ------------------------------------------------------------ fabrication */
  for (const row of parsed.fabrication) {
    if (row.aCompleter) {
      issues.push(
        makeIssue({
          severity: "info",
          code: "INVALID_TEXT",
          rowIndex: row.rowIndex,
          column: "À compléter",
          message: `Ligne ${row.rowIndex} · marquée « à compléter » dans le fichier : importée telle quelle.`,
        }),
      );
    }
    if (!row.code) {
      issues.push(
        makeIssue({
          severity: "warning",
          code: "REQUIRED_FIELD_MISSING",
          rowIndex: row.rowIndex,
          column: "Code",
          message: `Ligne ${row.rowIndex} · code affaire absent : ligne ignorée.`,
        }),
      );
      continue;
    }
    if (!row.element) {
      issues.push(
        makeIssue({
          severity: "warning",
          code: "REQUIRED_FIELD_MISSING",
          rowIndex: row.rowIndex,
          column: "Élément",
          message: `Ligne ${row.rowIndex} · élément absent : ligne ignorée.`,
        }),
      );
      continue;
    }
    if (!row.metierReconnu) {
      issues.push(
        makeIssue({
          severity: "error",
          code: "UNKNOWN_REFERENCE",
          rowIndex: row.rowIndex,
          column: "Métier",
          value: row.metierRaw,
          message: `Ligne ${row.rowIndex} · métier « ${row.metierRaw || "(vide)"} » non reconnu.`,
        }),
      );
      continue;
    }

    const affaire = touchAffaire(row.code, row.projet);
    if (!affaire.existingId) {
      issues.push(
        makeIssue({
          severity: "warning",
          code: "UNKNOWN_REFERENCE",
          rowIndex: row.rowIndex,
          column: "Code",
          value: row.code,
          message: `Ligne ${row.rowIndex} · affaire ${row.code} introuvable : elle sera créée si vous le confirmez.`,
        }),
      );
    }

    const objetKey = `${row.code}::${normLabel(row.element)}`;
    if (!objets.has(objetKey)) objets.set(objetKey, { code: row.code, nom: row.element });

    // Sous-traitance : pas de métier, donc ni heures ni charge atelier.
    if (row.sousTraitance || row.metierId == null) continue;

    const nbPers = row.nbPers && row.nbPers > 0 ? row.nbPers : null;
    if (nbPers == null) {
      issues.push(
        makeIssue({
          severity: "warning",
          code: "INVALID_NUMBER",
          rowIndex: row.rowIndex,
          column: "Nb pers.",
          value: row.nbPers,
          message: `Ligne ${row.rowIndex} · effectif absent ou nul : aucune heure ni planning générés.`,
        }),
      );
    } else {
      joursHommes += nbPers;
      const hKey = `${objetKey}::${row.metierId}`;
      const existing = heures.get(hKey);
      if (existing) {
        existing.heures += nbPers * HEURES_PAR_PERSONNE_JOUR;
        if (row.tache) existing.taches.add(row.tache);
      } else {
        heures.set(hKey, {
          code: row.code,
          element: row.element,
          metierId: row.metierId,
          heures: nbPers * HEURES_PAR_PERSONNE_JOUR,
          note: null,
          sousTraitance: false,
          origine,
          taches: new Set(row.tache ? [row.tache] : []),
        });
      }
    }

    if (!row.date) {
      issues.push(
        makeIssue({
          severity: "warning",
          code: "INVALID_DATE",
          rowIndex: row.rowIndex,
          column: "Date",
          value: row.dateBrute,
          message: `Ligne ${row.rowIndex} · date absente ou invalide : objet et heures importés, pas de ligne de planning.`,
        }),
      );
      continue;
    }
    if (nbPers == null) continue;

    const pKey = `${objetKey}::${row.metierId}::${row.date}`;
    const prev = planning.get(pKey);
    if (prev) {
      prev.nbPers = clampNbPers(prev.nbPers + nbPers);
    } else {
      planning.set(pKey, {
        code: row.code,
        element: row.element,
        metierId: row.metierId,
        date: row.date,
        nbPers: clampNbPers(nbPers),
        note: row.tache || null,
      });
    }

    /* ------------------------------------------------- affectations Équipe n */
    if (!ctx.withAffectations) continue;
    for (const prenom of row.equipe) {
      const candidats = ctx.employesByPrenom.get(normLabel(prenom)) ?? [];
      if (candidats.length !== 1) {
        if (!nonResolus.has(prenom)) {
          nonResolus.add(prenom);
          issues.push(
            makeIssue({
              severity: "warning",
              code: "UNKNOWN_REFERENCE",
              rowIndex: row.rowIndex,
              column: "Équipe",
              value: prenom,
              message:
                candidats.length === 0
                  ? `Prénom « ${prenom} » sans correspondance dans les employés : affectation ignorée (aucun employé n'est créé).`
                  : `Prénom « ${prenom} » ambigu (${candidats.length} employés) : affectation ignorée, à trancher manuellement.`,
            }),
          );
        }
        continue;
      }
      const emp = candidats[0]!;
      affectations.set(`${pKey}::${emp.id}`, {
        code: row.code,
        element: row.element,
        metierId: row.metierId,
        date: row.date,
        employeId: emp.id,
        prenom,
      });
    }
  }

  /* -------------------------------------------------------------- livraisons */
  for (const liv of parsed.livraisons) {
    const code = liv.code ?? findCodeByNom(liv.projet, affaires, ctx.affairesByCode);
    if (!code) {
      issues.push(
        makeIssue({
          severity: "warning",
          code: "UNKNOWN_REFERENCE",
          rowIndex: liv.rowIndex,
          column: "Projet / Client",
          value: liv.projet,
          message: `Ligne ${liv.rowIndex} (Livraisons) · impossible de rattacher « ${liv.projet} » à une affaire : ligne ignorée.`,
        }),
      );
      continue;
    }
    const affaire = touchAffaire(code, liv.projet);
    const kind = classifyLivraisonType(liv.type);
    const m = affaire.montage ?? {};
    if (kind === "demontage") {
      m.date_demontage = liv.debut ?? liv.fin ?? m.date_demontage ?? null;
    } else if (kind === "montage") {
      m.date_montage = liv.debut ?? m.date_montage ?? null;
      if (liv.fin) m.date_demontage = m.date_demontage ?? null;
    }
    if (liv.nbTech != null) m.montage_nb_techniciens = Math.round(liv.nbTech);
    if (liv.nuit) m.montage_travail_nuit = true;
    if (liv.semi != null) m.montage_nb_semi = Math.round(liv.semi);
    if (liv.m3_20 != null) m.montage_nb_20m3 = Math.round(liv.m3_20);
    if (liv.nature) m.montage_nature_prestation = liv.nature;
    if (liv.notes) m.montage_notes = [m.montage_notes, liv.notes].filter(Boolean).join(" · ");
    affaire.montage = m;
  }

  /* ------------------------------------- onglet Affectations (info uniquement) */
  if (ctx.withAffectations) {
    for (const aff of parsed.affectations) {
      const candidats = ctx.employesByPrenom.get(normLabel(aff.personne)) ?? [];
      if (candidats.length !== 1 && !nonResolus.has(aff.personne)) {
        nonResolus.add(aff.personne);
        issues.push(
          makeIssue({
            severity: "warning",
            code: "UNKNOWN_REFERENCE",
            rowIndex: aff.rowIndex,
            column: "Personne",
            value: aff.personne,
            message: `Onglet Affectations · « ${aff.personne} » sans correspondance unique dans les employés : à trancher manuellement.`,
          }),
        );
      }
    }
  }

  const heuresList: PlanHeures[] = [...heures.values()].map((h) => ({
    code: h.code,
    element: h.element,
    metierId: h.metierId,
    heures: Math.round(h.heures * 100) / 100,
    note: h.taches.size > 0 ? [...h.taches].join(" · ").slice(0, 500) : null,
    sousTraitance: h.sousTraitance,
    origine: h.origine,
  }));

  const affairesList = [...affaires.values()];
  return {
    affaires: affairesList,
    objets: [...objets.values()],
    heures: heuresList,
    planning: [...planning.values()],
    affectations: [...affectations.values()],
    prenomsNonResolus: [...nonResolus],
    issues,
    totals: {
      affaires: affairesList.length,
      affairesACreer: affairesList.filter((a) => !a.existingId).length,
      objets: objets.size,
      lignesHeures: heuresList.length,
      lignesPlanning: planning.size,
      affectations: affectations.size,
      joursHommes,
    },
  };
}

function findCodeByNom(
  projet: string,
  planAffaires: Map<string, PlanAffaire>,
  existantes: Map<string, { id: string; nom: string }>,
): string | null {
  const n = normLabel(projet);
  if (!n) return null;
  for (const [code, a] of planAffaires) {
    if (normLabel(a.nom) === n) return code;
  }
  for (const [code, a] of existantes) {
    if (normLabel(a.nom) === n) return code;
  }
  return null;
}

/** Marque les lignes de sous-traitance : utilisées par l'exécuteur pour la colonne dédiée. */
export function isSousTraitanceRow(parsed: ParsedPlanning, code: string, element: string): boolean {
  const n = normLabel(element);
  return parsed.fabrication.some((r) => r.code === code && normLabel(r.element) === n && r.sousTraitance);
}
