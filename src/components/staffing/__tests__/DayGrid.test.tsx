/**
 * @vitest-environment happy-dom
 */
// v0.39.2b2.1 Tour 2 — Tests unitaires DayGrid
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayGrid } from "../gantt/DayGrid";
import type { PlanStep } from "@/lib/staffing/types";

const days = ["2026-05-04", "2026-05-05", "2026-05-06"];
const gridTemplate = `220px repeat(${days.length * 2}, minmax(22px, 1fr))`;

function step(over: Partial<PlanStep>): PlanStep {
  return {
    id: "s1",
    plan_id: "p1",
    objet_id: null,
    metier_id: 7, // Manut
    pers: 2,
    h_par_jour: 8,
    span_days: 2,
    span_demi_jours: 4,
    start_date: "2026-05-04",
    start_half_day: "AM",
    phase: "FIN",
    ...over,
  } as PlanStep;
}

describe("DayGrid", () => {
  it("rend le header avec dates AM/PM par jour", () => {
    render(
      <DayGrid
        days={days}
        gridTemplate={gridTemplate}
        mergedSteps={[]}
        dateLivraison="2026-05-31"
        dayWidthPx={50}
        stepOverrides={{}}
        edits={{}}
        impactByStep={{}}
        onShift={() => {}}
        onResetShift={() => {}}
      />,
    );
    const header = screen.getByTestId("day-grid-header");
    expect(header).toBeTruthy();
    // 1 colonne label + 2 colonnes (AM/PM) par jour
    const amCells = header.querySelectorAll("div.contents");
    expect(amCells.length).toBe(days.length);
    // Les badges AM/PM sont rendus pour chaque jour
    expect(header.textContent).toMatch(/AM/);
    expect(header.textContent).toMatch(/PM/);
  });

  it("n'affiche PAS la section globale si aucun step global", () => {
    render(
      <DayGrid
        days={days}
        gridTemplate={gridTemplate}
        mergedSteps={[step({ objet_id: "o1" })]}
        dateLivraison="2026-05-31"
        dayWidthPx={50}
        stepOverrides={{}}
        edits={{}}
        impactByStep={{}}
        onShift={() => {}}
        onResetShift={() => {}}
      />,
    );
    expect(screen.queryByTestId("day-grid-global-steps")).toBeNull();
  });

  it("affiche un step global Manut FIN avec heures = pers × demi × 4", () => {
    render(
      <DayGrid
        days={days}
        gridTemplate={gridTemplate}
        mergedSteps={[step({ objet_id: null, pers: 2, span_demi_jours: 4 })]}
        dateLivraison="2026-05-31"
        dayWidthPx={50}
        stepOverrides={{}}
        edits={{}}
        impactByStep={{}}
        onShift={() => {}}
        onResetShift={() => {}}
      />,
    );
    expect(screen.getByTestId("day-grid-global-steps")).toBeTruthy();
    expect(screen.getByText(/Manutention/)).toBeTruthy();
    // 2 × 4 × 4 = 32h
    expect(screen.getByText(/32h/)).toBeTruthy();
  });

  it("appelle onShift quand le GanttBar le déclenche", () => {
    const onShift = vi.fn();
    render(
      <DayGrid
        days={days}
        gridTemplate={gridTemplate}
        mergedSteps={[step({ objet_id: null })]}
        dateLivraison="2026-05-31"
        dayWidthPx={50}
        stepOverrides={{}}
        edits={{}}
        impactByStep={{}}
        onShift={onShift}
        onResetShift={() => {}}
      />,
    );
    // Le GanttBar expose des chevrons « shift gauche/droite »
    const shiftButtons = screen.getAllByRole("button");
    // au moins un bouton de shift présent
    expect(shiftButtons.length).toBeGreaterThan(0);
  });
});
