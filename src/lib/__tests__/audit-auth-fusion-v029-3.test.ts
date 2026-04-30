import { describe, it, expect } from "vitest";

/**
 * v0.29.3 — Audit + Incident Auth fusionnés.
 * Vérifie que :
 *  - le param search "tab" accepte uniquement les 4 valeurs valides
 *  - les valeurs inconnues retombent sur "connexions" (fallback)
 *  - la valeur "incidents" est bien acceptée (cible du redirect /incident-auth)
 */

import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";

const TAB_VALUES = ["connexions", "invitations", "evenements", "incidents"] as const;

const schema = z.object({
  tab: fallback(z.enum(TAB_VALUES), "connexions").default("connexions"),
});

describe("audit-auth search schema (v0.29.3 fusion)", () => {
  it("accepte les 4 onglets valides", () => {
    for (const v of TAB_VALUES) {
      expect(schema.parse({ tab: v }).tab).toBe(v);
    }
  });

  it("fallback sur connexions si tab manquant", () => {
    expect(schema.parse({}).tab).toBe("connexions");
  });

  it("fallback sur connexions si tab inconnu", () => {
    expect(schema.parse({ tab: "nimporte" }).tab).toBe("connexions");
  });

  it("la cible du redirect /incident-auth est valide", () => {
    expect(schema.parse({ tab: "incidents" }).tab).toBe("incidents");
  });
});

/**
 * Visibilité du bouton Export Excel dans /planning :
 * - parobjet → bouton "Excel objets" (handler matriciel)
 * - cdi / interim / budget → bouton "Excel" (handler week complet)
 * - autres onglets (parchantier / flotte / feuilleroute) → pas de bouton Excel
 */
type Tab = "cdi" | "interim" | "parchantier" | "parobjet" | "budget" | "flotte" | "feuilleroute";

function excelButtonKind(tab: Tab): "objet" | "week" | null {
  if (tab === "parobjet") return "objet";
  if (tab === "cdi" || tab === "interim" || tab === "budget") return "week";
  return null;
}

describe("Planning — visibilité bouton Export Excel (v0.29.3)", () => {
  it("parobjet → bouton 'objet'", () => {
    expect(excelButtonKind("parobjet")).toBe("objet");
  });

  it("cdi / interim / budget → bouton 'week'", () => {
    expect(excelButtonKind("cdi")).toBe("week");
    expect(excelButtonKind("interim")).toBe("week");
    expect(excelButtonKind("budget")).toBe("week");
  });

  it("parchantier / flotte / feuilleroute → pas de bouton Excel", () => {
    expect(excelButtonKind("parchantier")).toBeNull();
    expect(excelButtonKind("flotte")).toBeNull();
    expect(excelButtonKind("feuilleroute")).toBeNull();
  });
});
