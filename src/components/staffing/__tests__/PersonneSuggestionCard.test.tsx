import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonneSuggestionCard } from "../personnes/PersonneSuggestionCard";
import type { Suggestion } from "../personnes/shared";

const baseSuggestion: Suggestion = {
  employe: { id: "e1", nom: "Martin", prenom: "Jean", metier_principal_id: 1, type_contrat: "CDI" },
  score: 87,
  tier: 1,
  dispo_pct: 80,
  absent_days_in_step: 0,
  absent_today: false,
};

describe("PersonneSuggestionCard", () => {
  it("affiche nom, tier et badge contrat", () => {
    render(
      <PersonneSuggestionCard
        suggestion={baseSuggestion}
        alreadyAssigned={false}
        cumul={0}
        onAssign={vi.fn()}
      />,
    );
    expect(screen.getByText(/Jean Martin/)).toBeInTheDocument();
    expect(screen.getByText(/Tier 1/)).toBeInTheDocument();
    expect(screen.getByText("CDI")).toBeInTheDocument();
  });

  it("affiche le badge Absent ce jour", () => {
    render(
      <PersonneSuggestionCard
        suggestion={{ ...baseSuggestion, absent_today: true }}
        alreadyAssigned={false}
        cumul={0}
        onAssign={vi.fn()}
      />,
    );
    expect(screen.getByText(/Absent ce jour/)).toBeInTheDocument();
  });

  it("désactive le bouton Affecter quand alreadyAssigned", () => {
    render(
      <PersonneSuggestionCard
        suggestion={baseSuggestion}
        alreadyAssigned={true}
        cumul={100}
        onAssign={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Affecté/ })).toBeDisabled();
  });
});
