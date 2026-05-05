import { describe, it, expect } from "vitest";

// v0.40.0d hotfix race: merge prefill with later list fetch
function mergeAffaires(prev: Array<{id:string; numero:string}>, list: Array<{id:string; numero:string}>) {
  if (prev.length === 0) return list;
  const ids = new Set(list.map((a) => a.id));
  const extras = prev.filter((a) => !ids.has(a.id));
  return [...extras, ...list];
}

describe("v0.40.0d — merge affaires lists (race fix)", () => {
  it("préserve l'affaire pré-sélectionnée hors top 200 si fetch list résout en second", () => {
    const prefilled = [{ id: "uuid-old", numero: "1234" }];
    const top200 = [{ id: "uuid-recent", numero: "5905" }];
    const merged = mergeAffaires(prefilled, top200);
    expect(merged.find((a) => a.id === "uuid-old")).toBeTruthy();
    expect(merged.find((a) => a.id === "uuid-recent")).toBeTruthy();
  });
  it("ne duplique pas si l'affaire est déjà dans le top 200", () => {
    const prefilled = [{ id: "uuid-1", numero: "5905" }];
    const top200 = [{ id: "uuid-1", numero: "5905" }];
    const merged = mergeAffaires(prefilled, top200);
    expect(merged.length).toBe(1);
  });
  it("retourne juste le top 200 si pas de prefill", () => {
    const merged = mergeAffaires([], [{ id: "a", numero: "1" }]);
    expect(merged).toEqual([{ id: "a", numero: "1" }]);
  });
});
