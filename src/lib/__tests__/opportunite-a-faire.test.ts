import { describe, expect, it } from "vitest";
import {
  A_FAIRE_SEUILS,
  aFaireBadge,
  aFaireReferenceDate,
  countEnRetard,
  joursCalendairesDepuis,
  sortAFaire,
} from "@/lib/opportunite-a-faire";

// Référence fixe : jeudi 29 oct. 2026, 12:00 UTC (14:00 à Paris, UTC+1).
const NOW = new Date("2026-10-29T12:00:00Z");

function opp(depuis: string | null, created: string | null) {
  return { statut_opportunite_depuis: depuis, created_at: created };
}

describe("aFaireReferenceDate", () => {
  it("préfère statut_opportunite_depuis, sinon created_at", () => {
    expect(aFaireReferenceDate(opp("2026-10-20T08:00:00Z", "2026-10-01T08:00:00Z"))?.toISOString()).toBe(
      "2026-10-20T08:00:00.000Z",
    );
    expect(aFaireReferenceDate(opp(null, "2026-10-01T08:00:00Z"))?.toISOString()).toBe(
      "2026-10-01T08:00:00.000Z",
    );
    expect(aFaireReferenceDate(opp(null, null))).toBeNull();
  });
});

describe("sortAFaire — tri chronologique", () => {
  it("classe de la plus ancienne à la plus récente", () => {
    const items = [
      { id: "recente", ...opp("2026-10-28T08:00:00Z", null) },
      { id: "ancienne", ...opp("2026-10-10T08:00:00Z", null) },
      { id: "milieu", ...opp("2026-10-20T08:00:00Z", null) },
    ];
    expect(sortAFaire(items).map((i) => i.id)).toEqual(["ancienne", "milieu", "recente"]);
  });

  it("retombe sur created_at quand statut_opportunite_depuis est absent", () => {
    const items = [
      { id: "b", ...opp(null, "2026-10-25T08:00:00Z") },
      { id: "a", ...opp(null, "2026-10-15T08:00:00Z") },
    ];
    expect(sortAFaire(items).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("aFaireBadge — Nouvelle", () => {
  it("badge « nouvelle » si créée il y a moins de 24 h", () => {
    const o = opp("2026-10-29T10:00:00Z", "2026-10-29T10:00:00Z"); // 2 h
    expect(aFaireBadge(o, NOW)).toEqual({ kind: "nouvelle" });
  });

  it("pas de badge entre 24 h et 3 jours", () => {
    const o = opp("2026-10-28T08:00:00Z", "2026-10-28T08:00:00Z"); // ~28 h, 1 jour calendaire
    expect(aFaireBadge(o, NOW)).toBeNull();
  });
});

describe("aFaireBadge — En retard", () => {
  it("badge « retard » à J+3 (3 jours calendaires)", () => {
    const o = opp("2026-10-26T08:00:00Z", "2026-10-26T08:00:00Z");
    expect(aFaireBadge(o, NOW)).toEqual({ kind: "retard", jours: 3 });
  });

  it("badge « retard » à J+4", () => {
    const o = opp("2026-10-25T08:00:00Z", "2026-10-25T08:00:00Z");
    expect(aFaireBadge(o, NOW)).toEqual({ kind: "retard", jours: 4 });
  });

  it("pas de badge à J+2", () => {
    const o = opp("2026-10-27T08:00:00Z", "2026-10-27T08:00:00Z");
    expect(aFaireBadge(o, NOW)).toBeNull();
  });

  it("utilise created_at comme référence si statut_opportunite_depuis est absent", () => {
    const o = opp(null, "2026-10-20T08:00:00Z");
    expect(aFaireBadge(o, NOW)).toEqual({ kind: "retard", jours: 9 });
  });
});

describe("joursCalendairesDepuis — fuseau Europe/Paris", () => {
  it("compte en jours calendaires Paris (minuit Paris fait basculer le compteur)", () => {
    // 28 oct. 23:30 Paris = 22:30 UTC ; 29 oct. 00:30 Paris = 23:30 UTC (1 h plus tard)
    const ref = new Date("2026-10-28T22:30:00Z");
    const now = new Date("2026-10-28T23:30:00Z");
    expect(joursCalendairesDepuis(ref, now)).toBe(1);
  });
});

describe("countEnRetard — compteur d'en-tête", () => {
  it("compte uniquement les cartes en retard", () => {
    const items = [
      opp("2026-10-20T08:00:00Z", null), // retard 9 j
      opp("2026-10-25T08:00:00Z", null), // retard 4 j
      opp("2026-10-28T08:00:00Z", "2026-10-28T08:00:00Z"), // rien
      opp("2026-10-29T10:00:00Z", "2026-10-29T10:00:00Z"), // nouvelle
    ];
    expect(countEnRetard(items, NOW)).toBe(2);
  });
});

describe("seuils", () => {
  it("sont regroupés dans une constante", () => {
    expect(A_FAIRE_SEUILS).toEqual({ NOUVELLE_HEURES: 24, RETARD_JOURS: 3 });
  });
});
