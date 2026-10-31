import { describe, it, expect } from "vitest";
import { chunk, slugFromFilename, extractRows } from "../materiaux-import";

describe("import matériaux", () => {
  it("découpe 20 049 lignes (foussier) en 11 paquets de 2 000 max", () => {
    const parts = chunk(Array.from({ length: 20049 }, (_, i) => i));
    expect(parts).toHaveLength(11);
    expect(parts[10]).toHaveLength(49);
  });
  it("reconnaît le fournisseur depuis le nom de fichier", () => {
    const known = ["sm-bois", "vidal-bois", "arcelormittal-e-steel", "foussier"];
    expect(slugFromFilename("foussier.json", known)).toBe("foussier");
    expect(slugFromFilename("SM_Bois.json", known)).toBe("sm-bois");
    expect(slugFromFilename("inconnu.json", known)).toBeNull();
  });
  it("accepte un tableau ou un objet lignes", () => {
    expect(extractRows([{ a: 1 }])).toHaveLength(1);
    expect(extractRows({ lignes: [{ a: 1 }, { a: 2 }] })).toHaveLength(2);
    expect(() => extractRows({ x: 1 })).toThrow();
  });
});
