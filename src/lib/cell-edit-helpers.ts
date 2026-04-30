/**
 * v0.27 — Helpers de logique pure pour CellEditDialog
 * (édition groupée de toutes les affectations d'une cellule objet × jour)
 */

export interface ExistingRow {
  assignation_id: string;
  employe_id: string;
  metier_id: number;
  heures: number;
  initialHeures: number;
  toDelete?: boolean;
}

export interface NewRow {
  tempId: string;
  employe_id: string;
  metier_id: number;
  heures: number;
}

export interface CellPlan {
  toDeleteIds: string[];
  toUpdate: Array<{ assignation_id: string; heures: number }>;
  toInsert: Array<{ employe_id: string; metier_id: number; heures: number }>;
}

export interface CellValidation {
  ok: boolean;
  errors: string[];
}

/** Calcule le diff à appliquer en BDD à partir des rows en mémoire. */
export function buildCellPlan(rows: ExistingRow[], newRows: NewRow[]): CellPlan {
  const toDeleteIds = rows.filter((r) => r.toDelete).map((r) => r.assignation_id);
  const toUpdate = rows
    .filter((r) => !r.toDelete && r.heures !== r.initialHeures)
    .map((r) => ({ assignation_id: r.assignation_id, heures: r.heures }));
  const toInsert = newRows.map((n) => ({
    employe_id: n.employe_id,
    metier_id: n.metier_id,
    heures: n.heures,
  }));
  return { toDeleteIds, toUpdate, toInsert };
}

/** Heures totales sur l'objet APRÈS application du plan. */
export function projectedObjetHeures(
  heuresObjetTotalAvant: number,
  rows: ExistingRow[],
  newRows: NewRow[],
): number {
  const deltaExist = rows.reduce(
    (s, r) => s + (r.toDelete ? -r.initialHeures : r.heures - r.initialHeures),
    0,
  );
  const deltaNew = newRows.reduce((s, r) => s + Number(r.heures || 0), 0);
  return heuresObjetTotalAvant + deltaExist + deltaNew;
}

/** Validation : heures dans (0, 12], pas de doublon employé. */
export function validateCell(rows: ExistingRow[], newRows: NewRow[]): CellValidation {
  const errors: string[] = [];
  for (const r of rows) {
    if (r.toDelete) continue;
    if (r.heures <= 0 || r.heures > 12) {
      errors.push(`Heures invalides pour assignation ${r.assignation_id}`);
    }
  }
  for (const n of newRows) {
    if (n.heures <= 0 || n.heures > 12) {
      errors.push(`Heures invalides pour nouvel employé ${n.employe_id}`);
    }
  }
  // doublon employé (existant non supprimé + nouveau)
  const seen = new Set<string>();
  rows.filter((r) => !r.toDelete).forEach((r) => seen.add(r.employe_id));
  for (const n of newRows) {
    if (seen.has(n.employe_id)) {
      errors.push(`Employé en double : ${n.employe_id}`);
    }
    seen.add(n.employe_id);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Valide le budget objet : la somme projetée ne doit pas dépasser les heures devisées.
 * Si `heuresPrevues <= 0`, aucun budget défini → pas d'erreur (avertissement géré côté UI).
 * Renvoie un message détaillé en cas de dépassement.
 */
export interface BudgetValidation {
  ok: boolean;
  heuresApres: number;
  heuresPrevues: number;
  ecart: number; // > 0 ⇒ dépassement
  message?: string;
}

export function validateBudgetObjet(params: {
  heuresPrevues: number;
  heuresObjetTotalAvant: number;
  rows: ExistingRow[];
  newRows: NewRow[];
  objetLabel?: string;
}): BudgetValidation {
  const { heuresPrevues, heuresObjetTotalAvant, rows, newRows, objetLabel } = params;
  const heuresApres = projectedObjetHeures(heuresObjetTotalAvant, rows, newRows);
  const ecart = heuresPrevues > 0 ? heuresApres - heuresPrevues : 0;
  if (heuresPrevues > 0 && ecart > 0) {
    const label = objetLabel ? ` « ${objetLabel} »` : "";
    return {
      ok: false,
      heuresApres,
      heuresPrevues,
      ecart,
      message:
        `Dépassement du budget de l'objet${label} : ` +
        `${heuresApres}h projetées pour ${heuresPrevues}h devisées ` +
        `(+${ecart}h au-delà du devis). Réduisez les heures ou supprimez des affectations.`,
    };
  }
  return { ok: true, heuresApres, heuresPrevues, ecart };
}

/** Liste des employés disponibles à l'ajout (exclut ceux déjà présents et non supprimés). */
export function employesDisponibles<T extends { id: string }>(
  employes: T[],
  rows: ExistingRow[],
  newRows: NewRow[],
): T[] {
  const used = new Set<string>();
  rows.filter((r) => !r.toDelete).forEach((r) => used.add(r.employe_id));
  newRows.forEach((n) => used.add(n.employe_id));
  return employes.filter((e) => !used.has(e.id));
}
