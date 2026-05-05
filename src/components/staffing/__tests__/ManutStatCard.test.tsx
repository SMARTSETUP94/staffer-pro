/**
 * @vitest-environment happy-dom
 *
 * v0.40.0b+1 — Tests d'affichage de la StatCard récap Manutention.
 * Vérifie en particulier le cas FALLBACK (objets sans Bois/Peint/Tap) :
 *  - badge "N fallback" visible dans l'en-tête de la card
 *  - bandeau ambre dans le détail
 *  - subline B/P/T n'apparaît PAS quand rien n'est absorbé
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ManutStatCard } from "../ManutStatCard";
import { computeManutSummary } from "@/lib/staffing/manut-summary";
import type { ObjetInput } from "@/lib/staffing/types";

function obj(p: Partial<ObjetInput>): ObjetInput {
  return {
    objet_id: "x",
    reference: "X",
    nom: "X",
    heures_be: 0,
    heures_numerique: 0,
    heures_bois: 0,
    heures_metal: 0,
    heures_peinture: 0,
    heures_tapisserie: 0,
    heures_manutention: 0,
    display_order: 0,
    ...p,
  };
}

afterEach(cleanup);

describe("<ManutStatCard /> — affichage récap", () => {
  it("absorption normale : valeur FIN + subline B/P/T affichés, pas de badge fallback", () => {
    const summary = computeManutSummary(
      [obj({ heures_bois: 50, heures_peinture: 30, heures_tapisserie: 20, heures_manutention: 100 })],
      true,
    );
    render(<ManutStatCard summary={summary} />);

    expect(screen.getByTestId("manut-statcard-value")).toHaveTextContent("50 h FIN");
    expect(screen.getByTestId("manut-absorbed-bois")).toHaveTextContent("B 25 h");
    expect(screen.getByTestId("manut-absorbed-peint")).toHaveTextContent("P 15 h");
    expect(screen.getByTestId("manut-absorbed-tap")).toHaveTextContent("T 10 h");
    expect(screen.queryByTestId("manut-statcard-fallback-badge")).toBeNull();
  });

  it("FALLBACK seul : badge 'N fallback' visible dans l'en-tête, subline B/P/T absente", () => {
    const summary = computeManutSummary(
      [
        obj({ heures_metal: 20, heures_manutention: 40 }),
        obj({ heures_numerique: 10, heures_manutention: 30 }),
      ],
      true,
    );
    expect(summary.fallback_objets).toBe(2);
    expect(summary.absorbable_total_h).toBe(0);

    render(<ManutStatCard summary={summary} />);

    // Valeur FIN visible (50 % de 70h = 35h)
    expect(screen.getByTestId("manut-statcard-value")).toHaveTextContent("35 h FIN");
    // Badge fallback dans l'en-tête
    const badge = screen.getByTestId("manut-statcard-fallback-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("2 fallback");
    // Pas de subline d'absorption
    expect(screen.queryByTestId("manut-statcard-subline")).toBeNull();
    // Pas de subline legacy non plus (mode absorbé)
    expect(screen.queryByTestId("manut-statcard-legacy")).toBeNull();
  });

  it("MIX absorbé + fallback : subline présente ET badge fallback présent", () => {
    const summary = computeManutSummary(
      [
        obj({ heures_bois: 40, heures_manutention: 40 }), // absorbé
        obj({ heures_metal: 20, heures_manutention: 30 }), // fallback
      ],
      true,
    );
    expect(summary.fallback_objets).toBe(1);

    render(<ManutStatCard summary={summary} />);
    expect(screen.getByTestId("manut-statcard-subline")).toBeInTheDocument();
    expect(screen.getByTestId("manut-absorbed-bois")).toHaveTextContent(/B \d+ h/);
    const badge = screen.getByTestId("manut-statcard-fallback-badge");
    expect(badge).toHaveTextContent("1 fallback");
  });

  it("aucune Manutention : card 0 h sans subline ni badge", () => {
    const summary = computeManutSummary([obj({ heures_bois: 10 })], true);
    render(<ManutStatCard summary={summary} />);
    expect(screen.getByTestId("manut-statcard-value")).toHaveTextContent("0 h");
    expect(screen.queryByTestId("manut-statcard-subline")).toBeNull();
    expect(screen.queryByTestId("manut-statcard-fallback-badge")).toBeNull();
  });

  it("LEGACY mode : subline 'Mode legacy' visible, pas de badge fallback (jamais comptés)", () => {
    const summary = computeManutSummary(
      [
        obj({ heures_bois: 40, heures_manutention: 40 }),
        obj({ heures_metal: 20, heures_manutention: 30 }),
      ],
      false,
    );
    render(<ManutStatCard summary={summary} />);
    expect(screen.getByTestId("manut-statcard-legacy")).toBeInTheDocument();
    expect(screen.queryByTestId("manut-statcard-fallback-badge")).toBeNull();
    expect(screen.queryByTestId("manut-statcard-subline")).toBeNull();
  });

  it("summary undefined : card 0 h", () => {
    render(<ManutStatCard summary={undefined} />);
    expect(screen.getByTestId("manut-statcard-value")).toHaveTextContent("0 h");
  });
});
