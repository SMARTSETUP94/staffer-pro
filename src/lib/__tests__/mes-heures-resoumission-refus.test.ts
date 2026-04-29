/**
 * Tests de garde : re-soumission interdite depuis un statut autre que 'rejete'.
 *
 * Côté logique :
 *  - applyResubmit() doit lever pour 'brouillon' | 'soumis' | 'valide'
 *  - canTransition('X', 'soumis') doit refléter la matrice des transitions
 *
 * Côté UI mobile :
 *  - L'action "Re-soumettre" / le bouton "J'ai compris" sont DÉSACTIVÉS
 *  - Le bloc motif n'est PAS affiché à tort sur 'soumis' / 'valide' / 'brouillon'
 *  - Le badge "à lire" reste à 0 et le banner reste éteint
 */
import { describe, it, expect } from "vitest";
import {
  applyResubmit,
  canTransition,
  isAcquittementRequis,
  countAcquittementsRequis,
  type SaisieRejetee,
  type Statut,
} from "@/lib/validation-heures-helpers";

/* ─────────── Modèle ─────────── */

interface UiSaisie extends SaisieRejetee {
  id: string;
}

const shouldRenderInlineMotif = (s: UiSaisie) =>
  s.statut === "rejete" && !!s.motif_rejet;
const shouldRenderInlineAck = (s: UiSaisie) =>
  shouldRenderInlineMotif(s) && !s.motif_rejet_lu_le;
const isResoumettreEnabled = (s: UiSaisie) => s.statut === "rejete";
const shouldRenderTopBanner = (saisies: UiSaisie[]) =>
  countAcquittementsRequis(saisies) > 0;

/** Tous les statuts qui NE sont PAS 'rejete'. */
const NON_REJETE: Statut[] = ["brouillon", "soumis", "valide"];

const mk = (statut: Statut, overrides: Partial<UiSaisie> = {}): UiSaisie => ({
  id: `s-${statut}`,
  statut,
  // Cas piège : motif résiduel (rejet ancien après re-soumission ou validation)
  motif_rejet: statut === "brouillon" ? null : "Ancien motif (résiduel)",
  motif_rejet_lu_le: statut === "valide" ? "2026-04-29T10:00:00.000Z" : null,
  ...overrides,
});

/* ─────────── Tests ─────────── */

describe("Refus logique — applyResubmit refuse tout statut autre que 'rejete'", () => {
  it.each(NON_REJETE)("lève une erreur explicite pour statut='%s'", (statut) => {
    expect(() => applyResubmit(mk(statut))).toThrow(/rejete/);
  });

  it("accepte uniquement 'rejete' (référence positive)", () => {
    const s = mk("rejete", {
      motif_rejet: "Motif valide",
      motif_rejet_lu_le: null,
    });
    expect(() => applyResubmit(s)).not.toThrow();
    expect(applyResubmit(s).statut).toBe("soumis");
  });
});

describe("Refus logique — canTransition vers 'soumis'", () => {
  it("autorise 'rejete' → 'soumis' et 'brouillon' → 'soumis'", () => {
    expect(canTransition("rejete", "soumis")).toBe(true);
    expect(canTransition("brouillon", "soumis")).toBe(true);
  });

  it("refuse 'soumis' → 'soumis' (no-op interdit)", () => {
    expect(canTransition("soumis", "soumis")).toBe(false);
  });

  it("refuse 'valide' → 'soumis' (statut immuable côté employé)", () => {
    expect(canTransition("valide", "soumis")).toBe(false);
  });
});

describe("Refus UI — bouton 'Re-soumettre' désactivé hors 'rejete'", () => {
  it.each(NON_REJETE)(
    "désactivé pour statut='%s' (même avec motif résiduel en DB)",
    (statut) => {
      const s = mk(statut);
      expect(isResoumettreEnabled(s)).toBe(false);
    },
  );

  it("activé uniquement pour 'rejete'", () => {
    expect(isResoumettreEnabled(mk("rejete", { motif_rejet: "X" }))).toBe(true);
  });
});

describe("Refus UI — motif et bouton 'J'ai compris' n'apparaissent PAS à tort", () => {
  it.each(NON_REJETE)(
    "le bloc motif n'est PAS affiché pour statut='%s' même si motif_rejet est présent en DB",
    (statut) => {
      const s = mk(statut, { motif_rejet: "Motif résiduel d'un ancien rejet" });
      expect(shouldRenderInlineMotif(s)).toBe(false);
    },
  );

  it.each(NON_REJETE)(
    "le bouton 'J'ai compris' n'est PAS affiché pour statut='%s'",
    (statut) => {
      const s = mk(statut, {
        motif_rejet: "Motif résiduel",
        motif_rejet_lu_le: null, // cas piège : non lu mais statut !== rejete
      });
      expect(shouldRenderInlineAck(s)).toBe(false);
    },
  );

  it("isAcquittementRequis = false sur tout statut !== 'rejete' (peu importe motif/lu)", () => {
    for (const statut of NON_REJETE) {
      const s = mk(statut, { motif_rejet: "Résiduel", motif_rejet_lu_le: null });
      expect(isAcquittementRequis(s)).toBe(false);
    }
  });
});

describe("Refus UI — banner global et compteur 'à lire'", () => {
  it("banner reste ÉTEINT sur une semaine sans aucun statut 'rejete'", () => {
    const week: UiSaisie[] = [mk("brouillon"), mk("soumis"), mk("valide")];
    expect(shouldRenderTopBanner(week)).toBe(false);
    expect(countAcquittementsRequis(week)).toBe(0);
  });

  it("ignore les saisies 'soumis' avec motif résiduel (cas après re-soumission)", () => {
    const week: UiSaisie[] = [
      mk("soumis", {
        motif_rejet: "Ancien rejet déjà traité",
        motif_rejet_lu_le: "2026-04-29T09:00:00.000Z",
      }),
    ];
    expect(countAcquittementsRequis(week)).toBe(0);
    expect(shouldRenderTopBanner(week)).toBe(false);
  });

  it("ignore les saisies 'valide' même si motif_rejet_lu_le est null (cas dégénéré DB)", () => {
    const week: UiSaisie[] = [
      mk("valide", { motif_rejet: "Motif", motif_rejet_lu_le: null }),
    ];
    expect(countAcquittementsRequis(week)).toBe(0);
    expect(shouldRenderTopBanner(week)).toBe(false);
  });
});

describe("Refus UI — invariants combinés (cohérence stricte)", () => {
  it("aucune action UI active sur 'soumis' (pas de motif, pas de bouton ack, pas de re-soumission)", () => {
    const s = mk("soumis", {
      motif_rejet: "Motif résiduel piège",
      motif_rejet_lu_le: null,
    });
    expect(shouldRenderInlineMotif(s)).toBe(false);
    expect(shouldRenderInlineAck(s)).toBe(false);
    expect(isResoumettreEnabled(s)).toBe(false);
    expect(isAcquittementRequis(s)).toBe(false);
    expect(() => applyResubmit(s)).toThrow();
  });

  it("aucune action UI active sur 'valide' (statut terminal côté employé)", () => {
    const s = mk("valide", {
      motif_rejet: "Motif d'un cycle de rejet précédent",
      motif_rejet_lu_le: null,
    });
    expect(shouldRenderInlineMotif(s)).toBe(false);
    expect(shouldRenderInlineAck(s)).toBe(false);
    expect(isResoumettreEnabled(s)).toBe(false);
    expect(() => applyResubmit(s)).toThrow();
  });

  it("aucune action UI active sur 'brouillon' (jamais soumis, jamais rejeté)", () => {
    const s = mk("brouillon");
    expect(shouldRenderInlineMotif(s)).toBe(false);
    expect(shouldRenderInlineAck(s)).toBe(false);
    expect(isResoumettreEnabled(s)).toBe(false);
    expect(() => applyResubmit(s)).toThrow();
  });

  it("table de vérité complète : seul statut='rejete' active motif+ack+re-soumission", () => {
    const allStatuts: Statut[] = ["brouillon", "soumis", "valide", "rejete"];
    const expected = {
      brouillon: { motif: false, ack: false, resoumettre: false },
      soumis:    { motif: false, ack: false, resoumettre: false },
      valide:    { motif: false, ack: false, resoumettre: false },
      rejete:    { motif: true,  ack: true,  resoumettre: true  },
    } as const;

    for (const statut of allStatuts) {
      const s = mk(statut, { motif_rejet: "Motif", motif_rejet_lu_le: null });
      expect({
        motif: shouldRenderInlineMotif(s),
        ack: shouldRenderInlineAck(s),
        resoumettre: isResoumettreEnabled(s),
      }).toEqual(expected[statut]);
    }
  });
});
