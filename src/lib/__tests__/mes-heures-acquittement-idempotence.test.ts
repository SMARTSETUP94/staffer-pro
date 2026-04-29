/**
 * Tests d'idempotence du flux "J'ai compris" + re-soumission.
 *
 * Règle métier :
 *  - Si l'employé a déjà cliqué "J'ai compris" (motif_rejet_lu_le posé),
 *    une re-soumission NE DOIT PAS :
 *      1. réécrire motif_rejet_lu_le (timestamp d'origine préservé pour audit)
 *      2. logger une nouvelle ligne 'acquittement' dans l'historique
 *         (logger 'soumission' à la place)
 *      3. rallumer le bouton inline "J'ai compris" ni le badge "à lire"
 *      4. créer une nouvelle notification employé
 *
 *  - Cliquer plusieurs fois "J'ai compris" sur la même saisie est aussi
 *    idempotent côté UI : motif_rejet_lu_le n'est pas réécrit.
 */
import { describe, it, expect } from "vitest";
import {
  applyResubmit,
  isAcquittementRequis,
  countAcquittementsRequis,
  actionTypeFor,
  expectedNotificationsFor,
  type SaisieRejetee,
  type Statut,
} from "@/lib/validation-heures-helpers";

/* ─────────── Modèle ─────────── */

interface UiSaisie extends SaisieRejetee {
  id: string;
}

const TS_ACK = "2026-04-29T10:00:00.000Z";
const TS_RESUBMIT = "2026-04-29T11:30:00.000Z";

const rejeteAcquitté = (overrides: Partial<UiSaisie> = {}): UiSaisie => ({
  id: "s-ack",
  statut: "rejete" as Statut,
  motif_rejet: "Pause non déduite (45 min)",
  motif_rejet_lu_le: TS_ACK,
  ...overrides,
});

const rejeteNonLu = (overrides: Partial<UiSaisie> = {}): UiSaisie => ({
  id: "s-rejet",
  statut: "rejete" as Statut,
  motif_rejet: "Heures incohérentes",
  motif_rejet_lu_le: null,
  ...overrides,
});

/** UI helpers (cf. mes-heures-mobile-ui.test.ts) */
const shouldRenderInlineAck = (s: UiSaisie) =>
  s.statut === "rejete" && !!s.motif_rejet && !s.motif_rejet_lu_le;
const shouldRenderTopBanner = (saisies: UiSaisie[]) =>
  countAcquittementsRequis(saisies) > 0;

/** Simule un clic "J'ai compris" idempotent : ne réécrit pas si déjà posé. */
function applyAck(s: UiSaisie, nowIso: string): UiSaisie {
  if (s.motif_rejet_lu_le) return s; // idempotent
  return { ...s, motif_rejet_lu_le: nowIso };
}

/* ─────────── Tests ─────────── */

describe("Idempotence — applyResubmit sur saisie DÉJÀ acquittée", () => {
  it("préserve le timestamp d'acquittement existant (pas de réécriture)", () => {
    const before = rejeteAcquitté();
    const after = applyResubmit(before);
    expect(after.motif_rejet_lu_le).toBe(TS_ACK);
    expect(after.motif_rejet_lu_le).not.toBe(TS_RESUBMIT);
  });

  it("conserve le motif_rejet sur la saisie", () => {
    const before = rejeteAcquitté({ motif_rejet: "Motif A" });
    const after = applyResubmit(before);
    expect(after.motif_rejet).toBe("Motif A");
  });

  it("fait bien passer le statut à 'soumis' (la re-soumission s'effectue)", () => {
    const before = rejeteAcquitté();
    const after = applyResubmit(before);
    expect(after.statut).toBe("soumis");
  });

  it("appliquer applyResubmit deux fois est interdit (statut !== 'rejete' la 2e fois)", () => {
    const before = rejeteAcquitté();
    const once = applyResubmit(before);
    expect(() => applyResubmit(once)).toThrow(/rejete/);
  });
});

describe("Idempotence — UI : ni badge 'à lire' ni bouton inline ne se rallument", () => {
  it("après re-soumission d'une saisie acquittée, le bouton 'J'ai compris' reste éteint", () => {
    const before = rejeteAcquitté();
    expect(shouldRenderInlineAck(before)).toBe(false); // déjà éteint car acquitté

    const afterCore = applyResubmit(before);
    const afterUi: UiSaisie = { id: before.id, ...afterCore };

    expect(shouldRenderInlineAck(afterUi)).toBe(false);
  });

  it("après re-soumission d'une saisie acquittée, le badge 'à lire' reste à 0", () => {
    const before = rejeteAcquitté();
    expect(countAcquittementsRequis([before])).toBe(0);

    const afterCore = applyResubmit(before);
    const afterUi: UiSaisie = { id: before.id, ...afterCore };

    expect(countAcquittementsRequis([afterUi])).toBe(0);
    expect(shouldRenderTopBanner([afterUi])).toBe(false);
  });

  it("isAcquittementRequis reste false avant ET après la re-soumission idempotente", () => {
    const before = rejeteAcquitté();
    expect(isAcquittementRequis(before)).toBe(false);

    const after = applyResubmit(before);
    expect(isAcquittementRequis(after)).toBe(false);
  });
});

describe("Idempotence — historique : 'soumission' (et non 'acquittement') quand déjà acquitté", () => {
  it("actionTypeFor retourne 'soumission' si l'acquittement n'est pas requis", () => {
    const action = actionTypeFor(
      { from: "rejete", to: "soumis" },
      { saisiParChef: false, estResoumissionAvecAcquittement: false },
    );
    expect(action).toBe("soumission");
  });

  it("actionTypeFor retourne 'acquittement' uniquement si la re-soumission DÉCLENCHE l'acquittement", () => {
    const action = actionTypeFor(
      { from: "rejete", to: "soumis" },
      { saisiParChef: false, estResoumissionAvecAcquittement: true },
    );
    expect(action).toBe("acquittement");
  });

  it("contrat trigger SQL : `estResoumissionAvecAcquittement` ↔ motif_rejet_lu_le était null avant", () => {
    // Cas 1 : motif déjà lu → pas d'acquittement, action = 'soumission'
    const dejaLu = rejeteAcquitté();
    const ackRequisAvant = isAcquittementRequis(dejaLu);
    expect(ackRequisAvant).toBe(false);
    expect(
      actionTypeFor(
        { from: "rejete", to: "soumis" },
        { saisiParChef: false, estResoumissionAvecAcquittement: ackRequisAvant },
      ),
    ).toBe("soumission");

    // Cas 2 : motif non lu → acquittement, action = 'acquittement'
    const nonLu = rejeteNonLu();
    const ackRequisAvant2 = isAcquittementRequis(nonLu);
    expect(ackRequisAvant2).toBe(true);
    expect(
      actionTypeFor(
        { from: "rejete", to: "soumis" },
        { saisiParChef: false, estResoumissionAvecAcquittement: ackRequisAvant2 },
      ),
    ).toBe("acquittement");
  });
});

describe("Idempotence — notifications : aucune nouvelle notif pour une re-soumission", () => {
  it("la re-soumission d'une saisie déjà acquittée ne crée AUCUNE notification employé", () => {
    const notifs = expectedNotificationsFor(
      { from: "rejete", to: "soumis" },
      { saisieId: "s-ack", employeProfileId: "profile-x" },
    );
    expect(notifs).toEqual([]);
  });

  it("idem si la re-soumission acquitte automatiquement (aucune notif employé)", () => {
    // Le contrat est : pas de notif sur 'rejete' → 'soumis', point.
    const notifs = expectedNotificationsFor(
      { from: "rejete", to: "soumis" },
      { saisieId: "s-rejet", employeProfileId: "profile-y" },
    );
    expect(notifs).toEqual([]);
  });
});

describe("Idempotence — clic répété sur 'J'ai compris'", () => {
  it("applyAck est idempotent : 2 clics consécutifs ne réécrivent pas le timestamp", () => {
    const before = rejeteNonLu();
    const after1 = applyAck(before, TS_ACK);
    expect(after1.motif_rejet_lu_le).toBe(TS_ACK);

    const after2 = applyAck(after1, TS_RESUBMIT);
    // Pas de réécriture : le 1er ack reste source de vérité.
    expect(after2.motif_rejet_lu_le).toBe(TS_ACK);
  });

  it("applyAck sur une saisie déjà acquittée renvoie la MÊME référence (no-op détectable)", () => {
    const before = rejeteAcquitté();
    const after = applyAck(before, TS_RESUBMIT);
    expect(after).toBe(before);
  });

  it("100 clics simulés convergent vers un seul timestamp d'acquittement", () => {
    let s = rejeteNonLu();
    for (let i = 0; i < 100; i++) {
      s = applyAck(s, new Date(Date.now() + i * 1000).toISOString());
    }
    // Le timestamp doit être celui posé au 1er clic (i=0), pas le dernier.
    const premierClicTs = s.motif_rejet_lu_le!;
    s = applyAck(s, "2099-01-01T00:00:00Z");
    expect(s.motif_rejet_lu_le).toBe(premierClicTs);
  });
});

describe("Idempotence — multi-saisies, mix acquittées/non-lues", () => {
  it("re-soumettre les saisies acquittées d'une semaine ne change PAS le compteur 'à lire' du reste", () => {
    const sAck = rejeteAcquitté({ id: "s-ack" });
    const sNonLu = rejeteNonLu({ id: "s-non-lu" });
    const all: UiSaisie[] = [sAck, sNonLu];

    expect(countAcquittementsRequis(all)).toBe(1);

    // L'employé re-soumet la saisie déjà acquittée (s-ack).
    const after = applyResubmit(sAck);
    const allAfter: UiSaisie[] = [{ id: "s-ack", ...after }, sNonLu];

    // Le compteur reste à 1 (à cause de s-non-lu uniquement).
    expect(countAcquittementsRequis(allAfter)).toBe(1);
    // s-non-lu inchangée (pas d'effet de bord).
    expect(allAfter[1].motif_rejet_lu_le).toBeNull();
  });

  it("convergence : plusieurs re-soumissions de saisies acquittées laissent le banner éteint", () => {
    const list: UiSaisie[] = [
      rejeteAcquitté({ id: "a" }),
      rejeteAcquitté({ id: "b", motif_rejet: "Autre" }),
      rejeteAcquitté({ id: "c", motif_rejet: "Encore un autre" }),
    ];
    expect(shouldRenderTopBanner(list)).toBe(false);

    const after: UiSaisie[] = list.map((s) => ({ id: s.id, ...applyResubmit(s) }));
    expect(shouldRenderTopBanner(after)).toBe(false);
    after.forEach((s) => expect(shouldRenderInlineAck(s)).toBe(false));
  });
});
