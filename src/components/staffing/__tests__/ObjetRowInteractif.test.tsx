// v0.39.2b2.1 Tour 3 — Smoke test ObjetRowInteractif
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObjetRowInteractif } from "../gantt/ObjetRowInteractif";
import type { PlanStep } from "@/lib/staffing/types";

const baseObj = {
  id: "o1",
  objet_id: "obj-1",
  reference: "1.1",
  nom: "Bar test",
  heures_total: 24,
};

const days = ["2025-01-06", "2025-01-07", "2025-01-08"];

const step: PlanStep = {
  id: "s1",
  objet_id: "obj-1",
  metier_id: 3, // Peinture
  pers: 2,
  span_days: 2,
  span_demi_jours: 4,
  start_date: "2025-01-06",
  start_half_day: "AM",
} as unknown as PlanStep;

function renderRow(overrides: Partial<Parameters<typeof ObjetRowInteractif>[0]> = {}) {
  const props = {
    obj: baseObj,
    idx: 0,
    totalObjets: 1,
    isExpanded: true,
    objSteps: [step],
    days,
    gridTemplate: `220px repeat(${days.length * 2}, 1fr)`,
    dateLivraison: "2025-01-31",
    dayWidthPx: 40,
    stepOverrides: {},
    edits: {},
    impactByStep: {},
    onToggle: vi.fn(),
    onReorder: vi.fn(),
    onShiftCascade: vi.fn(),
    onResetShift: vi.fn(),
    onSetPers: vi.fn(),
    onSetSpanDemiCascade: vi.fn(),
    onResetSpanDemi: vi.fn(),
    ...overrides,
  };
  return { ...render(<ObjetRowInteractif {...props} />), props };
}

describe("ObjetRowInteractif", () => {
  it("affiche le label objet (réf - nom)", () => {
    renderRow();
    expect(screen.getByTestId("gantt-objet-header-label")).toBeInTheDocument();
    expect(screen.getByText(/24 h · 1 étape/)).toBeInTheDocument();
  });

  it("expose le trigger d'édition cellule", () => {
    renderRow();
    const trigger = screen.getByTestId("cell-edit-trigger");
    expect(trigger).toBeInTheDocument();
    expect(trigger.textContent).toMatch(/2p ·/);
  });

  it("toggle replié n'affiche pas les steps", () => {
    renderRow({ isExpanded: false });
    expect(screen.queryByTestId("cell-edit-trigger")).not.toBeInTheDocument();
  });

  it("clic sur header objet déclenche onToggle", () => {
    const { props } = renderRow();
    fireEvent.click(screen.getByTestId("gantt-objet-header-label"));
    expect(props.onToggle).toHaveBeenCalledWith("o1");
  });
});
