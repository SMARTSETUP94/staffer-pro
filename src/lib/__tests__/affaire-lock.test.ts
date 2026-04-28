import { describe, expect, it } from "vitest";
import {
  affaireLockReason,
  canSaisieOnAffaire,
  isAffaireSelectable,
} from "../affaire-lock";

describe("isAffaireSelectable", () => {
  it("autorise prospect et en_cours", () => {
    expect(isAffaireSelectable({ statut: "prospect" })).toBe(true);
    expect(isAffaireSelectable({ statut: "en_cours" })).toBe(true);
  });
  it("refuse termine et annule", () => {
    expect(isAffaireSelectable({ statut: "termine" })).toBe(false);
    expect(isAffaireSelectable({ statut: "annule" })).toBe(false);
  });
});

describe("canSaisieOnAffaire", () => {
  it("autorise toujours sur affaire ouverte", () => {
    expect(
      canSaisieOnAffaire({ statut: "en_cours", date_demontage: null }, "2026-04-28"),
    ).toBe(true);
  });
  it("refuse toujours sur annule", () => {
    expect(
      canSaisieOnAffaire(
        { statut: "annule", date_demontage: "2026-12-31" },
        "2026-01-01",
      ),
    ).toBe(false);
  });
  it("autorise sur termine si date <= date_demontage", () => {
    expect(
      canSaisieOnAffaire(
        { statut: "termine", date_demontage: "2026-04-30" },
        "2026-04-28",
      ),
    ).toBe(true);
    expect(
      canSaisieOnAffaire(
        { statut: "termine", date_demontage: "2026-04-30" },
        "2026-04-30",
      ),
    ).toBe(true);
  });
  it("refuse sur termine si date > date_demontage", () => {
    expect(
      canSaisieOnAffaire(
        { statut: "termine", date_demontage: "2026-04-30" },
        "2026-05-01",
      ),
    ).toBe(false);
  });
  it("refuse strict sur termine sans date_demontage (fallback)", () => {
    expect(
      canSaisieOnAffaire({ statut: "termine", date_demontage: null }, "2026-04-28"),
    ).toBe(false);
  });
  it("accepte aussi un objet Date", () => {
    expect(
      canSaisieOnAffaire(
        { statut: "termine", date_demontage: "2026-04-30" },
        new Date(2026, 3, 28),
      ),
    ).toBe(true);
  });
});

describe("affaireLockReason", () => {
  it("retourne null si action autorisee", () => {
    expect(affaireLockReason({ statut: "en_cours", date_demontage: null })).toBeNull();
    expect(
      affaireLockReason(
        { statut: "termine", date_demontage: "2026-12-31" },
        "2026-06-01",
      ),
    ).toBeNull();
  });
  it("explique l'annulation", () => {
    expect(affaireLockReason({ statut: "annule", date_demontage: null })).toMatch(
      /annulée/i,
    );
  });
  it("explique la cloture sans date", () => {
    const msg = affaireLockReason({ statut: "termine", date_demontage: null });
    expect(msg).toMatch(/clôturée/i);
  });
  it("explique le depassement de date_demontage", () => {
    const msg = affaireLockReason(
      { statut: "termine", date_demontage: "2026-04-30" },
      "2026-05-15",
    );
    expect(msg).toMatch(/30\/04\/2026/);
  });
});
