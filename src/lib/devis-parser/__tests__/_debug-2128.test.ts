import { it } from "vitest";
import { parseDevisProgbatFromMatrix } from "@/lib/devis-parser/parse-excel";
import { ALL_FIXTURES } from "@/lib/devis-parser/__fixtures__/progbat-mocks";
it("debug", () => {
  const r = parseDevisProgbatFromMatrix(ALL_FIXTURES["D-2128"] as unknown[][], { filename: "x" });
  console.log("OBJETS:", JSON.stringify(r.objetsCandidats.map(o => ({ num: o.numero, sec: o.sectionNumero, secQte: o.sectionQuantite, qte: o.quantite, heures: o.heures, postesN: o.postes.length, postes: o.postes.map(p => ({ n: p.numero, m: p.metier, h: p.heuresUnitaires, mat: p.isMatiere, reg: p.isRegul })) })), null, 2));
  console.log("CHANTIER:", r.heuresChantier);
  console.log("INTEG:", r.integrityChecks);
  console.log("WARN:", r.warnings);
});
