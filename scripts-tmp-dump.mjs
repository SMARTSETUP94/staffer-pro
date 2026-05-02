import * as XLSX from "xlsx-js-style";
import { readFileSync } from "fs";

const buf = readFileSync("/tmp/D-2141.xlsx");
const wb = XLSX.read(buf, { type: "buffer", raw: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

// header detect
let headerRow = -1;
for (let i = 0; i < Math.min(rows.length, 30); i++) {
  const cells = (rows[i] ?? []).map(c => String(c ?? "").toLowerCase());
  if (cells.some(c => c.includes("designation") || c.includes("désignation") || c.includes("libelle"))
    && cells.some(c => c.includes("temps"))) { headerRow = i; break; }
}
console.log("HEADER ROW:", headerRow);
console.log("HEADER:", JSON.stringify(rows[headerRow]));
console.log("---");
// dump rows around section 1 / 1.1
for (let i = headerRow + 1; i < Math.min(rows.length, headerRow + 60); i++) {
  const r = rows[i] ?? [];
  console.log(i, JSON.stringify(r));
}
