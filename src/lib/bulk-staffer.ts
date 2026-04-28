/**
 * Bulk Staffer — helpers purs (utilisés par BulkStafferDialog + testés).
 *
 * Calcule l'ensemble des affectations à créer pour un staffing en masse
 * (employés × jours × créneau), en filtrant celles qui entreraient en
 * collision avec une affectation existante.
 */

export type Slot = "AM" | "PM" | "JOURNEE";

export interface ExistingAssignation {
  employe_id: string;
  date: string; // yyyy-MM-dd
  demi_journee: Slot;
}

export interface PlannedAssignation {
  employe_id: string;
  date: string;
  demi_journee: Slot;
}

export interface BulkPreviewItem extends PlannedAssignation {
  /** True si cette cellule est déjà occupée et doit être skippée. */
  skipped: boolean;
  /** Raison du skip si applicable. */
  skipReason?: string;
}

/**
 * Détermine si une nouvelle affectation entre en conflit avec les
 * créneaux déjà occupés sur la même cellule (employé × jour).
 *
 * Règles de conflit :
 * - JOURNEE en arrivée → conflit si quoi que ce soit existe déjà
 * - JOURNEE existante → conflit avec n'importe quoi
 * - AM/PM → conflit si même demi-journée déjà prise
 */
export function slotConflict(
  existingSlots: ReadonlySet<Slot>,
  incoming: Slot,
): boolean {
  if (existingSlots.size === 0) return false;
  if (existingSlots.has("JOURNEE")) return true;
  if (incoming === "JOURNEE") return true;
  return existingSlots.has(incoming);
}

/**
 * Calcule l'aperçu complet d'un staffing bulk :
 * employes × dates × slot, en marquant les cellules occupées comme skippées.
 */
export function computeBulkPreview(params: {
  employeIds: string[];
  dates: string[]; // yyyy-MM-dd
  slot: Slot;
  existing: ReadonlyArray<ExistingAssignation>;
}): BulkPreviewItem[] {
  const { employeIds, dates, slot, existing } = params;

  // Index : key "employeId::date" → Set<Slot>
  const occupiedByCell = new Map<string, Set<Slot>>();
  for (const a of existing) {
    const k = `${a.employe_id}::${a.date}`;
    let s = occupiedByCell.get(k);
    if (!s) {
      s = new Set();
      occupiedByCell.set(k, s);
    }
    s.add(a.demi_journee);
  }

  const out: BulkPreviewItem[] = [];
  // dédupe des cellules (employe, date) — on n'émet jamais 2 fois la même
  const seen = new Set<string>();

  for (const employe_id of employeIds) {
    for (const date of dates) {
      const k = `${employe_id}::${date}`;
      if (seen.has(k)) continue;
      seen.add(k);

      const occ = occupiedByCell.get(k) ?? new Set<Slot>();
      const conflict = slotConflict(occ, slot);
      if (conflict) {
        out.push({
          employe_id,
          date,
          demi_journee: slot,
          skipped: true,
          skipReason: occ.has("JOURNEE")
            ? "Journée déjà prise"
            : slot === "JOURNEE"
              ? "Demi-journée déjà occupée"
              : `${slot} déjà pris`,
        });
      } else {
        out.push({
          employe_id,
          date,
          demi_journee: slot,
          skipped: false,
        });
      }
    }
  }
  return out;
}

/** Renvoie uniquement les cellules à créer (filtre les skip). */
export function plannedToCreate(items: BulkPreviewItem[]): PlannedAssignation[] {
  return items
    .filter((it) => !it.skipped)
    .map(({ employe_id, date, demi_journee }) => ({ employe_id, date, demi_journee }));
}

/** Heures par défaut selon le créneau. */
export const HEURES_DEFAULT: Record<Slot, number> = {
  JOURNEE: 8,
  AM: 4,
  PM: 4,
};
