/**
 * v0.21.0 Bloc 6 — Helpers pour l'édition directe depuis la vue Planning par chantier.
 *
 * Logique pure (testable) qui calcule les payloads d'assignations à créer
 * pour un staffing multi-employés × multi-jours sur une affaire imposée.
 */

import { computeBulkPreview, plannedToCreate, HEURES_DEFAULT, type Slot } from "./bulk-staffer";
import type { Assignation, DevisLot } from "@/hooks/use-planning-data";

export interface ParChantierPayload {
  employe_id: string;
  affaire_id: string;
  metier_id: number;
  devis_id: string | null;
  date: string;
  demi_journee: Slot;
  heures: number;
  notes: null;
}

export interface BuildPayloadsParams {
  affaireId: string;
  metierId: number;
  devisId: string | null;
  slot: Slot;
  employeIds: string[];
  dates: string[];
  existing: Assignation[];
}

/**
 * Construit la liste des payloads à insérer en filtrant les collisions.
 * Renvoie aussi un compteur de cellules skippées pour feedback utilisateur.
 */
export function buildParChantierPayloads(params: BuildPayloadsParams): {
  payloads: ParChantierPayload[];
  skipped: number;
  total: number;
} {
  const preview = computeBulkPreview({
    employeIds: params.employeIds,
    dates: params.dates,
    slot: params.slot,
    existing: params.existing.map((a) => ({
      employe_id: a.employe_id,
      date: a.date,
      demi_journee: a.demi_journee,
    })),
  });
  const toCreate = plannedToCreate(preview);
  const heures = HEURES_DEFAULT[params.slot];
  const payloads: ParChantierPayload[] = toCreate.map((p) => ({
    employe_id: p.employe_id,
    affaire_id: params.affaireId,
    metier_id: params.metierId,
    devis_id: params.devisId,
    date: p.date,
    demi_journee: p.demi_journee,
    heures,
    notes: null,
  }));
  return {
    payloads,
    skipped: preview.length - toCreate.length,
    total: preview.length,
  };
}

/**
 * Pré-remplit le devis_id : si l'affaire n'a qu'un seul lot actif, le retourne.
 * Sinon null (utilisateur devra choisir).
 */
export function autoPickDevisLot(affaireId: string, devisLots: DevisLot[]): string | null {
  const actifs = devisLots.filter(
    (d) => d.affaire_id === affaireId && d.statut !== "termine" && d.statut !== "cloture",
  );
  return actifs.length === 1 ? actifs[0].id : null;
}
