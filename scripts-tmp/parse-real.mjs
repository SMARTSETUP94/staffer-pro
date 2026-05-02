import { parseDevisProgbatFromArrayBuffer } from "../src/lib/devis-parser/parse-excel.ts";
import { readFileSync } from "fs";
const buf = readFileSync("./scripts-tmp/D-2141.xlsx");
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const r = parseDevisProgbatFromArrayBuffer(ab, { filename: "D-202604-2141.xlsx" });
console.log("devisType:", r.devisType);
console.log("nb objets:", r.objetsCandidats.length);
console.log("\nObjets:");
for (const o of r.objetsCandidats) {
  console.log(`  ${o.numero} qte=${o.quantite} secQte=${o.sectionQuantite} "${o.nom.slice(0,50)}" → totH=${o.totalHeures}`);
  for (const p of o.postes) {
    const auto = (p.isMatiereOverride ?? p.isMatiere) || p.isRegul || (p.metier && p.heuresUnitaires>0);
    console.log(`    ${p.numero} ${auto?"AUTO":"MAN "} m=${p.metier ?? "—"} h=${p.heuresUnitaires} qty=${p.quantite} tot=${p.totalHt} mat=${p.isMatiere} : ${p.designation.slice(0,55)}`);
  }
}
console.log("\nIntegrity checks:");
for (const c of r.integrityChecks) {
  console.log(`  Sec ${c.sectionNumero} ${c.severite}: déclaré=${c.heuresDeclarees}h calculé=${c.heuresCalculees}h écart=${c.ecart}`);
}
console.log("\nWarnings:", r.warnings.length);
for (const w of r.warnings.slice(0,10)) console.log("  -", w);
