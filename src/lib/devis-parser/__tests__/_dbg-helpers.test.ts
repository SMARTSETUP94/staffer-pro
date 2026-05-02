import { it, expect } from "vitest";
import { parseDevisProgbatFromMatrix } from "../parse-excel";
import { ALL_FIXTURES } from "../__fixtures__/progbat-mocks";
it.skip("dbg", () => {
  const r = parseDevisProgbatFromMatrix(ALL_FIXTURES["D-3204"] as unknown[][], {});
  console.log("3204 objets:", JSON.stringify(r.objetsCandidats.map(o => ({ n: o.numero, nom: o.nom, qte: o.quantite, h: o.totalHeures, desc: o.description, w: o.warnings })), null, 2));
  console.log("3204 checks:", JSON.stringify(r.integrityChecks, null, 2));
  const r2 = parseDevisProgbatFromMatrix(ALL_FIXTURES["D-1832"] as unknown[][], {});
  console.log("1832 chantier:", r2.heuresChantier);
  console.log("1832 objets:", r2.objetsCandidats.map(o => ({ n: o.numero, nom: o.nom, h: o.totalHeures })));
  expect(true).toBe(true);
});
