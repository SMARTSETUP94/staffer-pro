/**
 * v0.28.1 — Tests business rule suppression opportunité.
 *
 * Couverture :
 * - À faire / Envoyé / Perdu / Gagné non signée → ok
 * - Terminée → bloquée (preserve historique)
 * - Signée (phase=signe + statut=gagne) → bloquée (déjà mutée en 5XXX)
 * - Messages FR actionnables (pas de jargon technique)
 */
import { describe, it, expect } from "vitest";
import {
  checkCanDeleteOpportunite,
  deleteBlockedMessage,
} from "../opportunite-delete";

describe("checkCanDeleteOpportunite — règles métier", () => {
  it("autorise suppression À faire", () => {
    expect(
      checkCanDeleteOpportunite({ statut_opportunite: "a_faire", phase: "opportunite" }),
    ).toEqual({ ok: true });
  });

  it("autorise suppression Envoyé", () => {
    expect(
      checkCanDeleteOpportunite({ statut_opportunite: "envoye", phase: "opportunite" }),
    ).toEqual({ ok: true });
  });

  it("autorise suppression Perdu", () => {
    expect(
      checkCanDeleteOpportunite({ statut_opportunite: "perdu", phase: "opportunite" }),
    ).toEqual({ ok: true });
  });

  it("autorise suppression Gagné non encore signée (phase=opportunite)", () => {
    expect(
      checkCanDeleteOpportunite({ statut_opportunite: "gagne", phase: "opportunite" }),
    ).toEqual({ ok: true });
  });

  it("bloque suppression Gagné signée (phase=signe)", () => {
    const r = checkCanDeleteOpportunite({
      statut_opportunite: "gagne",
      phase: "signe",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("signee");
  });

  it("bloque suppression Terminée (préservation historique)", () => {
    const r = checkCanDeleteOpportunite({
      statut_opportunite: "termine",
      phase: "opportunite",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("terminee");
  });

  it("bloque Terminée même si phase=signe", () => {
    const r = checkCanDeleteOpportunite({
      statut_opportunite: "termine",
      phase: "signe",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("terminee");
  });

  it("autorise quand statut_opportunite est null (cas legacy)", () => {
    expect(
      checkCanDeleteOpportunite({ statut_opportunite: null, phase: "opportunite" }),
    ).toEqual({ ok: true });
  });
});

describe("deleteBlockedMessage — messages FR actionnables", () => {
  it("message signée propose une alternative concrète", () => {
    const m = deleteBlockedMessage("signee");
    expect(m.title).toMatch(/signée/i);
    expect(m.description).toMatch(/perdu|archiv/i);
    // Pas de jargon technique
    expect(m.description).not.toMatch(/RLS|trigger|SQL/i);
  });

  it("message terminée explique la raison historique", () => {
    const m = deleteBlockedMessage("terminee");
    expect(m.title).toMatch(/terminée/i);
    expect(m.description).toMatch(/historique/i);
    expect(m.description).not.toMatch(/RLS|trigger|SQL/i);
  });
});
