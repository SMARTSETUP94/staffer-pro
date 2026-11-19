import { describe, expect, it } from "vitest";
import { cheminsPerimes } from "../fichiers";

const now = Date.parse("2026-11-19T18:00:00Z");
describe("purge mcp-tmp", () => {
  it("retire seulement les fichiers de plus de 10 minutes", () => {
    const objets = [
      { name: "a.jpg", created_at: "2026-11-19T17:49:59Z" },
      { name: "a.json", created_at: "2026-11-19T17:49:00Z" },
      { name: "b.jpg", created_at: "2026-11-19T17:50:01Z" },
      { name: "c.jpg", created_at: "2026-11-19T17:59:00Z" },
    ];
    expect(cheminsPerimes("u1", objets, now)).toEqual(["u1/a.jpg", "u1/a.json"]);
  });
  it("conserve un fichier sans date ou à date illisible", () => {
    expect(cheminsPerimes("u1", [{ name: "x", created_at: null }, { name: "y", created_at: "n/a" }], now)).toEqual([]);
  });
});
