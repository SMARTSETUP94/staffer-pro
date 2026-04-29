/**
 * Helpers purs du workflow de validation des heures.
 *
 * Extrait depuis _app.validation-heures.tsx, _app.mes-heures.tsx et les triggers SQL
 * pour rendre les invariants testables sans mocker Supabase.
 *
 * Workflow :
 *   brouillon → soumis → valide
 *                     ↘ rejete → soumis (re-soumission acquitte automatiquement)
 *
 * Notifications créées par les triggers DB :
 *   - heures_validees   : à l'employé quand chef valide
 *   - heures_rejetees   : à l'employé quand chef rejette (motif obligatoire)
 *   - saisie_par_chef   : à l'employé quand chef saisit pour lui (anti-spam)
 */

export type Statut = "brouillon" | "soumis" | "valide" | "rejete";

export type ActionType =
  | "creation_self"
  | "creation_chef"
  | "soumission"
  | "validation"
  | "rejet"
  | "acquittement"
  | "edition";

export type NotificationType =
  | "heures_validees"
  | "heures_rejetees"
  | "saisie_par_chef";

/* ─────────── Transitions de statut ─────────── */

const TRANSITIONS: Record<Statut, Statut[]> = {
  brouillon: ["soumis"],
  soumis: ["valide", "rejete", "brouillon"], // brouillon = annulation employé
  valide: [], // immuable hors admin
  rejete: ["soumis"], // re-soumission après acquittement
};

export function canTransition(from: Statut, to: Statut): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/* ─────────── Validation d'une action chef ─────────── */

export interface ValidateBulkInput {
  ids: string[];
  /** Statuts actuels des saisies, dans le même ordre que ids */
  currentStatuts: Statut[];
}

export interface ValidateBulkResult {
  ok: boolean;
  willUpdate: number;
  willIgnore: number;
  reason?: string;
}

/**
 * Simule le résultat d'un bulk-validate côté client.
 * En base, le `.eq("statut", "soumis")` filtre les saisies déjà traitées par
 * un autre chef → les ids non-soumis sont ignorés silencieusement.
 */
export function previewBulkValidate(input: ValidateBulkInput): ValidateBulkResult {
  if (input.ids.length === 0) return { ok: false, willUpdate: 0, willIgnore: 0, reason: "Aucune sélection" };
  if (input.ids.length !== input.currentStatuts.length) {
    return { ok: false, willUpdate: 0, willIgnore: 0, reason: "ids et statuts désynchronisés" };
  }
  const willUpdate = input.currentStatuts.filter((s) => s === "soumis").length;
  return { ok: true, willUpdate, willIgnore: input.ids.length - willUpdate };
}

/* ─────────── Validation du motif de rejet ─────────── */

export interface RejectInput {
  ids: string[];
  motif: string;
}

export type RejectError = "motif_vide" | "motif_trop_court" | "aucune_selection" | null;

export function validateRejectInput(input: RejectInput): RejectError {
  if (input.ids.length === 0) return "aucune_selection";
  const trimmed = input.motif.trim();
  if (!trimmed) return "motif_vide";
  if (trimmed.length < 3) return "motif_trop_court";
  return null;
}

/* ─────────── Accusé de réception côté employé ─────────── */

export interface SaisieRejetee {
  statut: Statut;
  motif_rejet: string | null;
  motif_rejet_lu_le: string | null;
}

/**
 * Une saisie est "à acquitter" (badge rouge côté employé) si elle est rejetée,
 * a un motif, et n'a pas encore été lue.
 */
export function isAcquittementRequis(s: SaisieRejetee): boolean {
  return s.statut === "rejete" && !!s.motif_rejet && !s.motif_rejet_lu_le;
}

/**
 * Compte les saisies nécessitant un accusé de réception.
 * Source de vérité du badge "X rejet(s) à lire" sur la page mes-heures.
 */
export function countAcquittementsRequis(saisies: SaisieRejetee[]): number {
  return saisies.filter(isAcquittementRequis).length;
}

/**
 * Re-soumettre une saisie rejetée doit AUTOMATIQUEMENT acquitter le motif
 * (trigger SQL set_motif_rejet_lu_le). Ce helper modélise le comportement
 * attendu côté client pour préviewer l'UI.
 */
export function applyResubmit(s: SaisieRejetee): SaisieRejetee & { statut: "soumis" } {
  if (s.statut !== "rejete") {
    throw new Error("applyResubmit: la saisie doit être au statut 'rejete'");
  }
  return {
    statut: "soumis",
    motif_rejet: s.motif_rejet,
    motif_rejet_lu_le: s.motif_rejet_lu_le ?? new Date().toISOString(),
  };
}

/* ─────────── Notifications attendues ─────────── */

export interface ExpectedNotification {
  type: NotificationType;
  user_id: string; // employé profile_id
  from_saisie_id: string;
}

/**
 * Liste les notifications que le trigger DB doit créer pour une transition.
 * Sert à fixer le contrat entre triggers et UI.
 */
export function expectedNotificationsFor(
  transition: { from: Statut; to: Statut },
  ctx: { saisieId: string; employeProfileId: string | null },
): ExpectedNotification[] {
  if (!ctx.employeProfileId) return []; // employé sans profil = pas de notif
  if (transition.from === "soumis" && transition.to === "valide") {
    return [{ type: "heures_validees", user_id: ctx.employeProfileId, from_saisie_id: ctx.saisieId }];
  }
  if (transition.from === "soumis" && transition.to === "rejete") {
    return [{ type: "heures_rejetees", user_id: ctx.employeProfileId, from_saisie_id: ctx.saisieId }];
  }
  return [];
}

/* ─────────── Historique attendu ─────────── */

/**
 * Action type loggée dans heures_saisies_historique pour une transition donnée.
 * Reflète la logique du trigger log_heures_saisies_transition.
 */
export function actionTypeFor(
  transition: { from: Statut | null; to: Statut },
  ctx: { saisiParChef: boolean; estResoumissionAvecAcquittement: boolean },
): ActionType | null {
  // Création
  if (transition.from === null) {
    if (transition.to === "brouillon" || transition.to === "soumis") {
      return ctx.saisiParChef ? "creation_chef" : "creation_self";
    }
  }
  // Re-soumission après rejet → acquittement (logué en plus de "soumission")
  if (transition.from === "rejete" && transition.to === "soumis") {
    return ctx.estResoumissionAvecAcquittement ? "acquittement" : "soumission";
  }
  if (transition.from === "brouillon" && transition.to === "soumis") return "soumission";
  if (transition.from === "soumis" && transition.to === "valide") return "validation";
  if (transition.from === "soumis" && transition.to === "rejete") return "rejet";
  return null;
}
