import { expect, it } from "vitest";
import { isValidManualAffaireCode } from "../typologie-future";

it("accepts a manually chosen 6XXX fabrication code", () => {
  expect(isValidManualAffaireCode("6123")).toBe(true);
});
it("accepts a manually chosen 4XXX montage code", () => {
  expect(isValidManualAffaireCode("4123")).toBe(true);
});
it("accepts a manually chosen 2XXXX stockage code", () => {
  expect(isValidManualAffaireCode("20123")).toBe(true);
});
it("rejects an opportunity code and malformed affair codes", () => {
  for (const code of ["9437", "612", "61234", "41234", "abc", ""]) {
    expect(isValidManualAffaireCode(code)).toBe(false);
  }
});