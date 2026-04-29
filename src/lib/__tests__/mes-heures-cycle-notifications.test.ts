/**
 * Tests cycle complet : soumission → rejet → re-soumission auto-acquittée → validation.
 *
 * Vérifie à chaque transition :
 *   - le statut résultant de la saisie
 *   - l'action_type loggée dans heures_saisies_historique
 *   - les notifications créées (ou absentes) pour l'employé
 *
 * Source de vérité : triggers SQL modélisés par les helpers purs
 * `expectedNotificationsFor` et `actionTypeFor`.
 */
import { describe, it, expect } from "vitest";
import {
  applyResubmit,
  expectedNotificationsFor,
  actionTypeFor,
  canTransition,
  isAcquittementRequis,
  type Statut,
  type ExpectedNotification,
  type ActionType,
} from "@/lib/validation-heures-helpers";

/* ─────────── Modèle de cycle ─────────── */

interface SaisieState {
  id: string;
  employe_profile_id: string;
  statut: Statut;
  motif_rejet: string | null;
  motif_rejet_lu_le: string | null;
}

interface HistoryEntry {
  saisie_id: string;
  action: ActionType | null;
  from: Statut | null;
  to: Statut;
}

interface CycleLog {
  state: SaisieState;
  history: HistoryEntry[];
  notifications: ExpectedNotification[];
}

/** Applique une transition + log historique + notifications attendues. */
function transition(
  log: CycleLog,
  to: Statut,
  ctx: {
    saisiParChef?: boolean;
    estResoumissionAvecAcquittement?: boolean;
    motifRejet?: string;
  } = {},
): CycleLog {
  const from = log.state.statut;

  // Cas spécial : re-soumission après rejet (utilise applyResubmit pour
  // refléter le trigger SQL set_motif_rejet_lu_le).
  if (from === "rejete" && to === "soumis") {
    const after = applyResubmit(log.state);
    const newState: SaisieState = {
      ...log.state,
      statut: after.statut,
      motif_rejet: after.motif_rejet,
      motif_rejet_lu_le: after.motif_rejet_lu_le,
    };
    const action = actionTypeFor(
      { from, to },
      {
        saisiParChef: false,
        estResoumissionAvecAcquittement: ctx.estResoumissionAvecAcquittement ?? true,
      },
    );
    const notifs = expectedNotificationsFor(
      { from, to },
      { saisieId: log.state.id, employeProfileId: log.state.employe_profile_id },
    );
    return {
      state: newState,
      history: [...log.history, { saisie_id: log.state.id, action, from, to }],
      notifications: [...log.notifications, ...notifs],
    };
  }

  const newState: SaisieState = { ...log.state, statut: to };
  if (to === "rejete") {
    newState.motif_rejet = ctx.motifRejet ?? "Motif générique";
    newState.motif_rejet_lu_le = null;
  }

  const action = actionTypeFor(
    { from, to },
    {
      saisiParChef: ctx.saisiParChef ?? false,
      estResoumissionAvecAcquittement: ctx.estResoumissionAvecAcquittement ?? false,
    },
  );
  const notifs = expectedNotificationsFor(
    { from, to },
    { saisieId: log.state.id, employeProfileId: log.state.employe_profile_id },
  );

  return {
    state: newState,
    history: [...log.history, { saisie_id: log.state.id, action, from, to }],
    notifications: [...log.notifications, ...notifs],
  };
}

/* ─────────── Fixtures ─────────── */

const SAISIE_ID = "s-jeudi-27-04";
const EMPLOYE_PROFILE_ID = "profile-alice";

const initial = (): CycleLog => ({
  state: {
    id: SAISIE_ID,
    employe_profile_id: EMPLOYE_PROFILE_ID,
    statut: "brouillon",
    motif_rejet: null,
    motif_rejet_lu_le: null,
  },
  history: [],
  notifications: [],
});

/* ─────────── Tests ─────────── */

describe("Cycle complet — rejet → re-soumission auto-acquittée → validation", () => {
  it("scénario nominal : génère exactement 2 notifications (rejet + validation)", () => {
    let log = initial();
    log = transition(log, "soumis"); // employé soumet
    log = transition(log, "rejete", { motifRejet: "Pause non déduite (45 min)" });
    log = transition(log, "soumis", { estResoumissionAvecAcquittement: true });
    log = transition(log, "valide");

    // === Statut final ===
    expect(log.state.statut).toBe("valide");
    expect(log.state.motif_rejet).toBe("Pause non déduite (45 min)"); // conservé pour traçabilité
    expect(log.state.motif_rejet_lu_le).toBeTruthy();

    // === Notifications : exactement 2, dans l'ordre ===
    expect(log.notifications).toHaveLength(2);
    expect(log.notifications[0]).toMatchObject({
      type: "heures_rejetees",
      user_id: EMPLOYE_PROFILE_ID,
      from_saisie_id: SAISIE_ID,
    });
    expect(log.notifications[1]).toMatchObject({
      type: "heures_validees",
      user_id: EMPLOYE_PROFILE_ID,
      from_saisie_id: SAISIE_ID,
    });

    // === Historique : 4 lignes avec les bonnes actions ===
    expect(log.history.map((h) => h.action)).toEqual([
      "soumission",
      "rejet",
      "acquittement", // re-soumission après rejet non-lu
      "validation",
    ]);
  });

  it("AUCUNE notification supplémentaire pendant la re-soumission (le silence est attendu)", () => {
    let log = initial();
    log = transition(log, "soumis");
    log = transition(log, "rejete", { motifRejet: "Heures incohérentes" });

    const notifsAvantResoumission = log.notifications.length;
    expect(notifsAvantResoumission).toBe(1);
    expect(log.notifications[0].type).toBe("heures_rejetees");

    // Re-soumission : zéro notification ajoutée.
    log = transition(log, "soumis", { estResoumissionAvecAcquittement: true });
    expect(log.notifications).toHaveLength(notifsAvantResoumission);
    // Mais une ligne d'historique 'acquittement' est bien posée.
    expect(log.history.at(-1)?.action).toBe("acquittement");
  });

  it("la validation finale notifie 'heures_validees' UNE seule fois (pas de doublon)", () => {
    let log = initial();
    log = transition(log, "soumis");
    log = transition(log, "rejete", { motifRejet: "X" });
    log = transition(log, "soumis", { estResoumissionAvecAcquittement: true });
    log = transition(log, "valide");

    const validees = log.notifications.filter((n) => n.type === "heures_validees");
    expect(validees).toHaveLength(1);
    expect(validees[0].from_saisie_id).toBe(SAISIE_ID);
  });

  it("logue 'soumission' (et non 'acquittement') si l'employé a cliqué 'J'ai compris' AVANT de re-soumettre", () => {
    let log = initial();
    log = transition(log, "soumis");
    log = transition(log, "rejete", { motifRejet: "Y" });

    // L'employé acquitte manuellement (motif_rejet_lu_le posé à la main).
    log = {
      ...log,
      state: { ...log.state, motif_rejet_lu_le: "2026-04-29T10:00:00.000Z" },
    };
    expect(isAcquittementRequis(log.state)).toBe(false);

    // Puis re-soumet : le trigger ne pose PAS d'acquittement (déjà fait).
    log = transition(log, "soumis", { estResoumissionAvecAcquittement: false });

    expect(log.history.at(-1)?.action).toBe("soumission");
    expect(log.notifications).toHaveLength(1); // seulement le rejet initial
  });
});

describe("Cycle complet — re-rejets multiples", () => {
  it("rejet → re-soumission → re-rejet → re-soumission → validation : 3 notifs (2 rejets + 1 validation)", () => {
    let log = initial();
    log = transition(log, "soumis");
    log = transition(log, "rejete", { motifRejet: "Premier motif" });
    log = transition(log, "soumis", { estResoumissionAvecAcquittement: true });
    log = transition(log, "rejete", { motifRejet: "Deuxième motif après contrôle" });
    log = transition(log, "soumis", { estResoumissionAvecAcquittement: true });
    log = transition(log, "valide");

    expect(log.notifications.map((n) => n.type)).toEqual([
      "heures_rejetees",
      "heures_rejetees",
      "heures_validees",
    ]);

    expect(log.history.map((h) => h.action)).toEqual([
      "soumission",
      "rejet",
      "acquittement",
      "rejet",
      "acquittement",
      "validation",
    ]);

    // Le motif final reflète le DERNIER rejet (puis acquitté + validé).
    expect(log.state.statut).toBe("valide");
    expect(log.state.motif_rejet).toBe("Deuxième motif après contrôle");
  });
});

describe("Cycle complet — invariants de transition", () => {
  it("toutes les transitions du scénario nominal sont autorisées par canTransition", () => {
    expect(canTransition("brouillon", "soumis")).toBe(true);
    expect(canTransition("soumis", "rejete")).toBe(true);
    expect(canTransition("rejete", "soumis")).toBe(true);
    expect(canTransition("soumis", "valide")).toBe(true);
  });

  it("tenter de re-rejeter une saisie déjà validée serait interdit (statut immuable)", () => {
    expect(canTransition("valide", "rejete")).toBe(false);
    expect(canTransition("valide", "soumis")).toBe(false);
    expect(canTransition("valide", "brouillon")).toBe(false);
  });

  it("aucune notification si l'employé n'a pas de profile_id (cas dégénéré)", () => {
    const log: CycleLog = {
      state: {
        id: "s-orphan",
        employe_profile_id: null as unknown as string,
        statut: "soumis",
        motif_rejet: null,
        motif_rejet_lu_le: null,
      },
      history: [],
      notifications: [],
    };

    const notifsRejet = expectedNotificationsFor(
      { from: "soumis", to: "rejete" },
      { saisieId: log.state.id, employeProfileId: null },
    );
    const notifsValidation = expectedNotificationsFor(
      { from: "soumis", to: "valide" },
      { saisieId: log.state.id, employeProfileId: null },
    );
    expect(notifsRejet).toEqual([]);
    expect(notifsValidation).toEqual([]);
  });
});

describe("Cycle complet — cohérence multi-saisies (lot validé en une fois)", () => {
  it("valider 3 saisies soumises génère 3 notifications 'heures_validees' distinctes", () => {
    const ids = ["s1", "s2", "s3"];
    const notifs = ids.flatMap((id) =>
      expectedNotificationsFor(
        { from: "soumis", to: "valide" },
        { saisieId: id, employeProfileId: EMPLOYE_PROFILE_ID },
      ),
    );
    expect(notifs).toHaveLength(3);
    expect(new Set(notifs.map((n) => n.from_saisie_id))).toEqual(new Set(ids));
    expect(notifs.every((n) => n.type === "heures_validees")).toBe(true);
  });

  it("rejeter en lot 2 saisies génère 2 notifications 'heures_rejetees' (une par saisie)", () => {
    const notifs = ["s1", "s2"].flatMap((id) =>
      expectedNotificationsFor(
        { from: "soumis", to: "rejete" },
        { saisieId: id, employeProfileId: EMPLOYE_PROFILE_ID },
      ),
    );
    expect(notifs).toHaveLength(2);
    expect(notifs.every((n) => n.type === "heures_rejetees")).toBe(true);
  });
});
