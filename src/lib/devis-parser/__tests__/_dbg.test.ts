import { it } from "vitest";
import { parseDevisProgbatFromMatrix } from "../parse-excel";
import { ALL_FIXTURES } from "../__fixtures__/progbat-mocks";
it("dbg", () => {
  const r = parseDevisProgbatFromMatrix(ALL_FIXTURES["D-3204"] as unknown[][], {});
  console.log("3204 objets:", r.objetsCandidats.map(o => ({ n: o.numero, nom: o.nom, qte: o.quantite, h: o.totalHeures, desc: o.description })));
  console.log("3204 checks:", r.integrityChecks);
  const r2 = parseDevisProgbatFromMatrix(ALL_FIXTURES["D-1832"] as unknown[][], {});
  console.log("1832 chantier:", r2.heuresChantier);
});
