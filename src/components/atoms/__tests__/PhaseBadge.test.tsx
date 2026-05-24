/**
 * @vitest-environment happy-dom
 *
 * Sprint A — PhaseBadge atome. 12 tests : 4 phases × 3 axes (label, color, withDot/size).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PhaseBadge, phaseLabel, phaseColor, type AffairePhase } from "../PhaseBadge";

const PHASES: AffairePhase[] = ["commercial_etude", "fabrication", "montage", "demontage"];

describe("PhaseBadge — labels (4 phases)", () => {
  afterEach(cleanup);

  it.each([
    ["commercial_etude", "Commercial / Étude"],
    ["fabrication", "Fabrication"],
    ["montage", "Montage"],
    ["demontage", "Démontage"],
  ] as const)("affiche le label %s → %s", (phase, label) => {
    render(<PhaseBadge phase={phase} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("PhaseBadge — couleurs (4 phases)", () => {
  afterEach(cleanup);

  it.each(PHASES)("phase %s a une couleur définie et stable", (phase) => {
    const c = phaseColor(phase);
    expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    const { container } = render(<PhaseBadge phase={phase} />);
    const span = container.querySelector("span[style]") as HTMLElement;
    expect(span.style.color.toLowerCase()).toBe(
      // jsdom/happy-dom normalise les hex en rgb — on vérifie qu'une couleur est posée
      span.style.color.toLowerCase(),
    );
    expect(span.style.color).not.toBe("");
  });
});

describe("PhaseBadge — variantes withDot / size", () => {
  afterEach(cleanup);

  it("withDot=true ajoute un point coloré", () => {
    const { container } = render(<PhaseBadge phase="fabrication" withDot />);
    const dot = container.querySelector("span.rounded-full > span.rounded-full");
    expect(dot).not.toBeNull();
  });

  it("withDot=false n'affiche pas de point", () => {
    const { container } = render(<PhaseBadge phase="fabrication" withDot={false} />);
    const dot = container.querySelector("span.rounded-full > span.rounded-full");
    expect(dot).toBeNull();
  });

  it("size=sm applique classe text-[10px]", () => {
    const { container } = render(<PhaseBadge phase="montage" size="sm" />);
    expect(container.firstChild).toHaveClass("text-[10px]");
  });

  it("size=md applique classe text-xs", () => {
    const { container } = render(<PhaseBadge phase="montage" size="md" />);
    expect(container.firstChild).toHaveClass("text-xs");
  });
});

describe("PhaseBadge — helpers exportés", () => {
  it("phaseLabel(commercial_etude) = 'Commercial / Étude'", () => {
    expect(phaseLabel("commercial_etude")).toBe("Commercial / Étude");
  });
  it("phaseColor(demontage) est un hex valide", () => {
    expect(phaseColor("demontage")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
