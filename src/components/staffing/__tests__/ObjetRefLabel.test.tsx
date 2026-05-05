/**
 * @vitest-environment happy-dom
 */
// v0.39.2b2.1 — ObjetRefLabel : strip prefix + affichage nom.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObjetRefLabel, stripDevisPrefix, setShowDevisPrefix } from "../ObjetRefLabel";

describe("stripDevisPrefix", () => {
  it("retire `D-202604-2151-1.1` → `1.1`", () => {
    expect(stripDevisPrefix("D-202604-2151-1.1")).toBe("1.1");
  });
  it("retire `D-202604-2141 (1)-2.3` → `2.3`", () => {
    expect(stripDevisPrefix("D-202604-2141 (1)-2.3")).toBe("2.3");
  });
  it("laisse `J1` intact", () => {
    expect(stripDevisPrefix("J1")).toBe("J1");
  });
  it("laisse `2.1` intact", () => {
    expect(stripDevisPrefix("2.1")).toBe("2.1");
  });
});

describe("ObjetRefLabel", () => {
  beforeEach(() => {
    setShowDevisPrefix(false);
  });
  it("affiche REF — NOM avec préfixe masqué par défaut", () => {
    render(<ObjetRefLabel reference="D-202604-2151-1.1" nom="M1 - peinture bar" />);
    expect(screen.getByText("1.1")).toBeInTheDocument();
    expect(screen.getByText(/M1 - peinture bar/)).toBeInTheDocument();
    expect(screen.queryByText("D-202604-2151-1.1")).not.toBeInTheDocument();
  });
  it("affiche le préfixe quand toggle activé", () => {
    setShowDevisPrefix(true);
    render(<ObjetRefLabel reference="D-202604-2151-1.1" nom="X" />);
    expect(screen.getByText("D-202604-2151-1.1")).toBeInTheDocument();
  });
  it("forceShowDevisPrefix override toggle", () => {
    render(<ObjetRefLabel reference="D-202604-2151-2.1" nom="X" forceShowDevisPrefix />);
    expect(screen.getByText("D-202604-2151-2.1")).toBeInTheDocument();
  });
});
