import * as XLSX from "xlsx-js-style";
import { readFileSync } from "fs";

const buf = readFileSync("./scripts-tmp/D-2141.xlsx");
const wb = XLSX.read(buf, { type: "buffer", raw: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

let headerRow = -1;
for (let i = 0; i < Math.min(rows.length, 30); i++) {
  const cells = (rows[i] ?? []).map(c => String(c ?? "").toLowerCase());
  if (cells.some(c => c.includes("designation") || c.includes("désignation") || c.includes("libelle"))
    && cells.some(c => c.includes("temps"))) { headerRow = i; break; }
}
console.log("HEADER ROW:", headerRow);
console.log("HEADER:", JSON.stringify(rows[headerRow]));
console.log("---");
for (let i = headerRow + 1; i < Math.min(rows.length, headerRow + 80); i++) {
  const r = rows[i] ?? [];
  // compact display
  const cleaned = r.map(c => (c === "" ? null : c));
  console.log(String(i).padStart(3), JSON.stringify(cleaned));
}
