/**
 * @vitest-environment happy-dom
 *
 * Sprint A — HeuresTriplet atome. 10 tests : formatage, couleurs écart, labels, edge cases.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { HeuresTriplet } from "../HeuresTriplet";

describe("HeuresTriplet — formatage", () => {
  afterEach(cleanup);

  it("entier → sans décimale", () => {
    render(<HeuresTriplet prevues={120} staffees={100} realisees={80} />);
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
  });

  it("décimale → 1 chiffre après virgule", () => {
    render(<HeuresTriplet prevues={12.5} staffees={null} realisees={null} />);
    expect(screen.getByText("12.5")).toBeInTheDocument();
  });

  it("null → tiret (—)", () => {
    const { container } = render(<HeuresTriplet prevues={null} staffees={null} realisees={null} />);
    expect(container.textContent).toContain("—");
  });
});

describe("HeuresTriplet — couleurs écart", () => {
  afterEach(cleanup);

  it("réalisé ≤ prévu → couleur neutre (text-foreground)", () => {
    const { container } = render(<HeuresTriplet prevues={100} staffees={100} realisees={100} />);
    const realisees = container.querySelectorAll("span")[3];
    expect(container.innerHTML).not.toMatch(/text-red-600|text-amber-600/);
  });

  it("réalisé > 105% prévu → couleur ambre", () => {
    const { container } = render(<HeuresTriplet prevues={100} staffees={100} realisees={110} />);
    expect(container.innerHTML).toMatch(/text-amber-600/);
  });

  it("réalisé > 115% prévu → couleur rouge", () => {
    const { container } = render(<HeuresTriplet prevues={100} staffees={100} realisees={120} />);
    expect(container.innerHTML).toMatch(/text-red-600/);
  });

  it("staffé > 115% prévu → couleur rouge sur staffé", () => {
    const { container } = render(<HeuresTriplet prevues={100} staffees={130} realisees={null} />);
    expect(container.innerHTML).toMatch(/text-red-600/);
  });
});

describe("HeuresTriplet — variantes affichage", () => {
  afterEach(cleanup);

  it("showLabels=true affiche Pré / Stf / Réa", () => {
    render(<HeuresTriplet prevues={10} staffees={8} realisees={5} showLabels />);
    expect(screen.getByText("Pré")).toBeInTheDocument();
    expect(screen.getByText("Stf")).toBeInTheDocument();
    expect(screen.getByText("Réa")).toBeInTheDocument();
  });

  it("showLabels=false (défaut) n'affiche pas les libellés", () => {
    render(<HeuresTriplet prevues={10} staffees={8} realisees={5} />);
    expect(screen.queryByText("Pré")).toBeNull();
  });

  it("size=md applique text-sm", () => {
    const { container } = render(<HeuresTriplet prevues={10} staffees={8} realisees={5} size="md" />);
    expect(container.firstChild).toHaveClass("text-sm");
  });

  it("size=sm (défaut) applique text-xs", () => {
    const { container } = render(<HeuresTriplet prevues={10} staffees={8} realisees={5} />);
    expect(container.firstChild).toHaveClass("text-xs");
  });
});

describe("HeuresTriplet — Sprint A.5 modes enrichis", () => {
  afterEach(cleanup);

  it("mode=row (défaut) inline horizontal", () => {
    const { container } = render(<HeuresTriplet prevues={10} staffees={8} realisees={5} />);
    expect(container.firstChild).toHaveClass("inline-flex");
  });

  it("mode=compact affiche un seul triplet condensé", () => {
    const { container } = render(
      <HeuresTriplet prevues={10} staffees={8} realisees={5} mode="compact" />,
    );
    expect(container.textContent).toMatch(/10.*8.*5/);
  });

  it("mode=card affiche en bloc avec labels", () => {
    const { container } = render(
      <HeuresTriplet prevues={10} staffees={8} realisees={5} mode="card" />,
    );
    expect(container.firstChild).toHaveClass("grid");
  });

  it("unit=total (défaut) n'ajoute pas /pers", () => {
    render(<HeuresTriplet prevues={120} staffees={100} realisees={80} />);
    expect(screen.queryByText(/\/pers/)).toBeNull();
  });

  it("unit=per_person affiche suffixe /pers", () => {
    render(
      <HeuresTriplet prevues={12} staffees={10} realisees={8} unit="per_person" />,
    );
    expect(screen.getAllByText(/\/pers/i).length).toBeGreaterThan(0);
  });
});

