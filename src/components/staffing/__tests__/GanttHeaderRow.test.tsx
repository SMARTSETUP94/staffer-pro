/**
 * @vitest-environment happy-dom
 *
 * v0.39.2b2.1 — Test unit GanttHeaderRow (extraction depuis GanttInteractif).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { GanttHeaderRow, type GanttStats } from "../gantt/GanttHeaderRow";

afterEach(() => cleanup());


const baseStats: GanttStats = {
  totalH: 800,
  pic: 6,
  statut: "Conforme",
  statutColor: "text-emerald-600",
  hDevis: 1000,
  breakdown: [{ label: "Bois", h: 800, persDemi: 200, steps: 4 }],
};

describe("GanttHeaderRow", () => {
  it("affiche les 5 cards (Heures/Livraison/Pic/Statut/Manut)", () => {
    render(
      <GanttHeaderRow stats={baseStats} manutSummary={undefined} dateLivraison="2026-06-15" />,
    );
    expect(screen.getByText(/Heures staffées/i)).toBeTruthy();
    expect(screen.getByText(/Livraison HARD/i)).toBeTruthy();
    expect(screen.getByText(/Pic atelier/i)).toBeTruthy();
    expect(screen.getByText(/Statut/i)).toBeTruthy();
  });

  it("affiche le badge écart vs devis si |écart| ≥ 5%", () => {
    render(
      <GanttHeaderRow stats={baseStats} manutSummary={undefined} dateLivraison="2026-06-15" />,
    );
    // 800 vs 1000 = -20% → badge "-20.0%"
    expect(screen.getByLabelText(/Écart vs devis/i)).toBeTruthy();
  });

  it("aucun badge si écart < 5%", () => {
    render(
      <GanttHeaderRow
        stats={{ ...baseStats, totalH: 990 }}
        manutSummary={undefined}
        dateLivraison="2026-06-15"
      />,
    );
    expect(screen.queryByLabelText(/Écart vs devis/i)).toBeNull();
  });

  it("aucun badge si hDevis = 0", () => {
    render(
      <GanttHeaderRow
        stats={{ ...baseStats, hDevis: 0 }}
        manutSummary={undefined}
        dateLivraison="2026-06-15"
      />,
    );
    expect(screen.queryByLabelText(/Écart vs devis/i)).toBeNull();
    expect(screen.getByText(/800 h/)).toBeTruthy();
  });
});
