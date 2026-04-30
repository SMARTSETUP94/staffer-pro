/**
 * v0.28.1 — Helpers suppression opportunité.
 *
 * Règle métier : on autorise la suppression UI seulement pour les opportunités
 * "non signées" et non "terminées". La BDD a aussi un trigger BEFORE DELETE
 * (prevent_delete_signed_opportunite) qui constitue la dernière barrière.
 */
import type { OpportuniteStatut } from "./opportunites";

export interface DeletableOpportunite {
  statut_opportunite: OpportuniteStatut | null;
  /** Phase d'affaire BDD : 'opportunite' ou 'signe'. */
  phase?: string | null;
}

export type DeleteCheck =
  | { ok: true }
  | { ok: false; reason: "signee" | "terminee" };

/** Renvoie si la suppression est autorisée par les règles métier (côté UI). */
export function checkCanDeleteOpportunite(opp: DeletableOpportunite): DeleteCheck {
  if (opp.statut_opportunite === "termine") {
    return { ok: false, reason: "terminee" };
  }
  if (opp.phase === "signe" && opp.statut_opportunite === "gagne") {
    return { ok: false, reason: "signee" };
  }
  return { ok: true };
}

export function deleteBlockedMessage(reason: "signee" | "terminee"): {
  title: string;
  description: string;
} {
  if (reason === "signee") {
    return {
      title: "Impossible de supprimer une opportunité signée",
      description:
        "Modifiez le statut en \"Perdu\" à la place, ou archivez l'affaire associée.",
    };
  }
  return {
    title: "Impossible de supprimer une opportunité terminée",
    description: "Conservez l'historique : utilisez le statut Perdu si besoin.",
  };
}
