/**
 * Suite E2E (logique) du workflow validation/rejet des heures.
 *
 * Ces tests fixent les invariants critiques sans mocker Supabase :
 *   - transitions de statut autorisées
 *   - validation bulk (anti-double-traitement)
 *   - motif de rejet obligatoire
 *   - notifications créées par les triggers DB
 *   - accusé de réception côté employé (motif_rejet_lu_le)
 *   - historique : action_type loggé selon la transition
 *   - re-soumission acquitte automatiquement le rejet
 */
import { describe, it, expect } from "vitest";
import {
  canTransition,
  previewBulkValidate,
  validateRejectInput,
  isAcquittementRequis,
  countAcquittementsRequis,
  applyResubmit,
  expectedNotificationsFor,
  actionTypeFor,
  type SaisieRejetee,
  type Statut,
} from "@/lib/validation-heures-helpers";

describe("workflow validation heures — transitions de statut", () => {
  it("brouillon → soumis OK", () => {
    expect(canTransition("brouillon", "soumis")).toBe(true);
  });

  it("soumis → valide OK", () => {
    expect(canTransition("soumis", "valide")).toBe(true);
  });

  it("soumis → rejete OK", () => {
    expect(canTransition("soumis", "rejete")).toBe(true);
  });

  it("rejete → soumis OK (re-soumission)", () => {
    expect(canTransition("rejete", "soumis")).toBe(true);
  });

  it("valide est immuable (hors admin)", () => {
    expect(canTransition("valide", "soumis")).toBe(false);
    expect(canTransition("valide", "rejete")).toBe(false);
    expect(canTransition("valide", "brouillon")).toBe(false);
  });

  it("rejete → valide DIRECT interdit (doit re-soumettre d'abord)", () => {
    expect(canTransition("rejete", "valide")).toBe(false);
  });

  it("brouillon → valide DIRECT interdit (doit soumettre d'abord)", () => {
    expect(canTransition("brouillon", "valide")).toBe(false);
  });
});

describe("workflow validation heures — bulk validate (anti-double-traitement)", () => {
  it("retourne erreur si sélection vide", () => {
    const r = previewBulkValidate({ ids: [], currentStatuts: [] });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/sélection/i);
  });

  it("compte les saisies réellement validables (statut=soumis)", () => {
    const r = previewBulkValidate({
      ids: ["a", "b", "c", "d"],
      currentStatuts: ["soumis", "soumis", "valide", "rejete"],
    });
    expect(r.ok).toBe(true);
    expect(r.willUpdate).toBe(2);
    expect(r.willIgnore).toBe(2);
  });

  it("100% ignored quand aucune n'est en attente (course chef vs chef)", () => {
    const r = previewBulkValidate({
      ids: ["x", "y"],
      currentStatuts: ["valide", "valide"],
    });
    expect(r.willUpdate).toBe(0);
    expect(r.willIgnore).toBe(2);
  });
});

describe("workflow validation heures — motif de rejet", () => {
  it("motif vide → erreur", () => {
    expect(validateRejectInput({ ids: ["a"], motif: "" })).toBe("motif_vide");
    expect(validateRejectInput({ ids: ["a"], motif: "   " })).toBe("motif_vide");
  });

  it("motif trop court → erreur", () => {
    expect(validateRejectInput({ ids: ["a"], motif: "ok" })).toBe("motif_trop_court");
  });

  it("aucune sélection → erreur", () => {
    expect(validateRejectInput({ ids: [], motif: "raison valable" })).toBe("aucune_selection");
  });

  it("motif valide → null (= ok)", () => {
    expect(validateRejectInput({ ids: ["a"], motif: "Heures incohérentes avec le planning" })).toBeNull();
  });
});

describe("workflow validation heures — notifications attendues (trigger DB)", () => {
  const ctx = { saisieId: "saisie-1", employeProfileId: "user-emp-1" };

  it("validation crée une notif heures_validees pour l'employé", () => {
    const notifs = expectedNotificationsFor({ from: "soumis", to: "valide" }, ctx);
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toEqual({
      type: "heures_validees",
      user_id: "user-emp-1",
      from_saisie_id: "saisie-1",
    });
  });

  it("rejet crée une notif heures_rejetees pour l'employé", () => {
    const notifs = expectedNotificationsFor({ from: "soumis", to: "rejete" }, ctx);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("heures_rejetees");
  });

  it("aucune notif si l'employé n'a pas de profil (intérim sans compte)", () => {
    const notifs = expectedNotificationsFor(
      { from: "soumis", to: "valide" },
      { saisieId: "s", employeProfileId: null },
    );
    expect(notifs).toEqual([]);
  });

  it("aucune notif sur soumission ou re-soumission (employé → chef gérée ailleurs)", () => {
    expect(expectedNotificationsFor({ from: "brouillon", to: "soumis" }, ctx)).toEqual([]);
    expect(expectedNotificationsFor({ from: "rejete", to: "soumis" }, ctx)).toEqual([]);
  });
});

describe("workflow validation heures — accusé de réception côté employé", () => {
  const baseRejet: SaisieRejetee = {
    statut: "rejete",
    motif_rejet: "Heures incohérentes",
    motif_rejet_lu_le: null,
  };

  it("rejet non lu → acquittement requis", () => {
    expect(isAcquittementRequis(baseRejet)).toBe(true);
  });

  it("rejet déjà lu → plus d'acquittement", () => {
    expect(isAcquittementRequis({ ...baseRejet, motif_rejet_lu_le: new Date().toISOString() })).toBe(false);
  });

  it("rejet sans motif → pas d'acquittement (cas dégénéré historique)", () => {
    expect(isAcquittementRequis({ ...baseRejet, motif_rejet: null })).toBe(false);
  });

  it("statut non rejeté → pas d'acquittement", () => {
    expect(isAcquittementRequis({ statut: "valide", motif_rejet: null, motif_rejet_lu_le: null })).toBe(false);
    expect(isAcquittementRequis({ statut: "soumis", motif_rejet: null, motif_rejet_lu_le: null })).toBe(false);
  });

  it("compte le bon nombre de rejets à lire dans une liste mixte", () => {
    const saisies: SaisieRejetee[] = [
      baseRejet, // à lire
      { ...baseRejet, motif_rejet_lu_le: "2026-01-01" }, // déjà lu
      baseRejet, // à lire
      { statut: "valide", motif_rejet: null, motif_rejet_lu_le: null },
      { statut: "soumis", motif_rejet: null, motif_rejet_lu_le: null },
    ];
    expect(countAcquittementsRequis(saisies)).toBe(2);
  });

  it("re-soumettre une saisie rejetée acquitte automatiquement le motif", () => {
    const next = applyResubmit(baseRejet);
    expect(next.statut).toBe("soumis");
    expect(next.motif_rejet_lu_le).toBeTruthy();
    expect(isAcquittementRequis(next)).toBe(false);
  });

  it("re-soumettre conserve un acquittement existant (idempotent)", () => {
    const already = { ...baseRejet, motif_rejet_lu_le: "2026-04-01T10:00:00Z" };
    const next = applyResubmit(already);
    expect(next.motif_rejet_lu_le).toBe("2026-04-01T10:00:00Z");
  });

  it("re-soumettre une saisie non-rejetée jette une erreur", () => {
    expect(() =>
      applyResubmit({ statut: "soumis", motif_rejet: null, motif_rejet_lu_le: null }),
    ).toThrow();
  });
});

describe("workflow validation heures — historique (action_type loggé)", () => {
  it("création par employé lui-même → creation_self", () => {
    expect(
      actionTypeFor({ from: null, to: "brouillon" }, { saisiParChef: false, estResoumissionAvecAcquittement: false }),
    ).toBe("creation_self");
  });

  it("création par chef pour un employé → creation_chef", () => {
    expect(
      actionTypeFor({ from: null, to: "soumis" }, { saisiParChef: true, estResoumissionAvecAcquittement: false }),
    ).toBe("creation_chef");
  });

  it("brouillon → soumis = soumission", () => {
    expect(
      actionTypeFor({ from: "brouillon", to: "soumis" }, { saisiParChef: false, estResoumissionAvecAcquittement: false }),
    ).toBe("soumission");
  });

  it("soumis → valide = validation", () => {
    expect(
      actionTypeFor({ from: "soumis", to: "valide" }, { saisiParChef: false, estResoumissionAvecAcquittement: false }),
    ).toBe("validation");
  });

  it("soumis → rejete = rejet", () => {
    expect(
      actionTypeFor({ from: "soumis", to: "rejete" }, { saisiParChef: false, estResoumissionAvecAcquittement: false }),
    ).toBe("rejet");
  });

  it("rejete → soumis avec acquittement = acquittement", () => {
    expect(
      actionTypeFor({ from: "rejete", to: "soumis" }, { saisiParChef: false, estResoumissionAvecAcquittement: true }),
    ).toBe("acquittement");
  });

  it("rejete → soumis sans acquittement (déjà lu) = soumission", () => {
    expect(
      actionTypeFor({ from: "rejete", to: "soumis" }, { saisiParChef: false, estResoumissionAvecAcquittement: false }),
    ).toBe("soumission");
  });

  it("transitions interdites → null (pas loggées)", () => {
    expect(
      actionTypeFor({ from: "valide", to: "rejete" }, { saisiParChef: false, estResoumissionAvecAcquittement: false }),
    ).toBeNull();
  });
});

describe("workflow validation heures — scénario E2E complet", () => {
  it("happy path : employé saisit → soumet → chef valide → notif employé", () => {
    // 1. Employé crée
    const created = actionTypeFor(
      { from: null, to: "brouillon" },
      { saisiParChef: false, estResoumissionAvecAcquittement: false },
    );
    expect(created).toBe("creation_self");

    // 2. Employé soumet
    expect(canTransition("brouillon", "soumis")).toBe(true);
    const submitted = actionTypeFor(
      { from: "brouillon", to: "soumis" },
      { saisiParChef: false, estResoumissionAvecAcquittement: false },
    );
    expect(submitted).toBe("soumission");

    // 3. Chef bulk-valide (au milieu de saisies déjà traitées)
    const bulk = previewBulkValidate({
      ids: ["s1", "s2"],
      currentStatuts: ["soumis", "soumis"],
    });
    expect(bulk.willUpdate).toBe(2);
    expect(bulk.willIgnore).toBe(0);

    // 4. Notif heures_validees créée pour l'employé
    const notifs = expectedNotificationsFor(
      { from: "soumis", to: "valide" },
      { saisieId: "s1", employeProfileId: "user-emp" },
    );
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("heures_validees");
  });

  it("rejection path : chef rejette → notif → employé acquitte → re-soumet", () => {
    // 1. Chef rejette avec motif valide
    expect(validateRejectInput({ ids: ["s1"], motif: "Mauvaise affaire affectée" })).toBeNull();

    // 2. Notif heures_rejetees créée
    const notifs = expectedNotificationsFor(
      { from: "soumis", to: "rejete" },
      { saisieId: "s1", employeProfileId: "user-emp" },
    );
    expect(notifs[0].type).toBe("heures_rejetees");

    // 3. Côté employé : badge "à lire" actif
    const rejet: SaisieRejetee = {
      statut: "rejete",
      motif_rejet: "Mauvaise affaire affectée",
      motif_rejet_lu_le: null,
    };
    expect(isAcquittementRequis(rejet)).toBe(true);

    // 4. Employé re-soumet → acquittement automatique
    const next = applyResubmit(rejet);
    expect(next.statut).toBe("soumis");
    expect(isAcquittementRequis(next)).toBe(false);

    // 5. L'historique log un acquittement (pas juste une soumission)
    const action = actionTypeFor(
      { from: "rejete", to: "soumis" },
      { saisiParChef: false, estResoumissionAvecAcquittement: true },
    );
    expect(action).toBe("acquittement");

    // 6. Aucune notif chef sur la re-soumission (pas spammer)
    const noNotif = expectedNotificationsFor(
      { from: "rejete", to: "soumis" },
      { saisieId: "s1", employeProfileId: "user-emp" },
    );
    expect(noNotif).toEqual([]);
  });

  it("course chef vs chef : 5 sélectionnées dont 3 déjà traitées", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const statuts: Statut[] = ["soumis", "valide", "rejete", "soumis", "valide"];
    const r = previewBulkValidate({ ids, currentStatuts: statuts });
    expect(r.willUpdate).toBe(2); // a, d
    expect(r.willIgnore).toBe(3); // b, c, e
  });

  it("rejet sans motif → bloqué côté UI avant appel DB", () => {
    expect(validateRejectInput({ ids: ["s1"], motif: "" })).toBe("motif_vide");
    expect(validateRejectInput({ ids: ["s1"], motif: "  \n " })).toBe("motif_vide");
  });
});
