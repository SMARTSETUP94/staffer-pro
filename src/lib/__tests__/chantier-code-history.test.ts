import { expect, it } from "vitest";
import { chantierCodeLabel, compareChantierChronology, matchesChantierCodeFilter } from "../chantier-code-history";

it("preserves the original opportunity position after signing into 6XXX or 4XXX", () => {
  const rows = [
    { numero: "6067", code_opportunite: "9438" },
    { numero: "9437", code_opportunite: null },
    { numero: "4133", code_opportunite: "9405" },
    { numero: "9410", code_opportunite: null },
  ];
  expect(rows.sort(compareChantierChronology).map(r => r.numero)).toEqual(["6067", "9437", "9410", "4133"]);
});

it("keeps signed opportunities available under the 9XXX filter", () => {
  expect(matchesChantierCodeFilter({ numero: "4133", code_opportunite: "9405" }, "9")).toBe(true);
  expect(matchesChantierCodeFilter({ numero: "6067", code_opportunite: "9438" }, "9")).toBe(true);
  expect(matchesChantierCodeFilter({ numero: "6065", code_opportunite: null }, "9")).toBe(false);
});

it("retains the original and signed numeric identities", () => {
  expect(chantierCodeLabel({ numero: "6067", code_opportunite: "9438" })).toBe("9438 → 6067");
  expect(chantierCodeLabel({ numero: "4133", code_opportunite: "9405" })).toBe("9405 → 4133");
  expect(chantierCodeLabel({ numero: "9437", code_opportunite: "9437" })).toBe("9437");
});