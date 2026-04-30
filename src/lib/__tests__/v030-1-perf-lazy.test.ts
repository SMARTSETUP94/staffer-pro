/**
 * v0.30.1 — Sentinel PERF : dedup xlsx + lazy-load des modules d'export Excel.
 *
 * 1) Confirme qu'un seul package xlsx-* est référencé (xlsx-js-style).
 *    Le package "xlsx" plain a été supprimé du projet en v0.30.1 — il était
 *    redondant avec xlsx-js-style (superset 100% compatible API).
 *
 * 2) Confirme que les routes lourdes (Planning) ne font PAS d'import statique
 *    des modules xlsx — ils doivent être chargés dynamiquement au clic.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");

function readFile(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

describe("v0.30.1 PERF — dedup xlsx", () => {
  it("package.json ne contient plus 'xlsx' (utilise uniquement xlsx-js-style)", () => {
    const pkg = JSON.parse(readFile("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const deps = pkg.dependencies ?? {};
    expect(deps["xlsx"]).toBeUndefined();
    expect(deps["xlsx-js-style"]).toBeDefined();
  });

  it("aucun fichier source ne fait `from \"xlsx\"` (uniquement xlsx-js-style)", () => {
    // On n'a pas accès à un walk de FS facile en test ; on couvre les fichiers
    // historiquement importeurs et on échoue si l'un d'eux régresse vers xlsx.
    const filesToCheck = [
      "src/lib/devis-import.ts",
      "src/lib/devis-parser/parse-excel.ts",
      "src/lib/heures-export.ts",
      "src/lib/opportunites-import.ts",
      "src/lib/planning-objet-xlsx-export.ts",
      "src/lib/trajets-soustraitance-export.ts",
    ];
    for (const f of filesToCheck) {
      const content = readFile(f);
      expect(
        content,
        `${f} devrait importer xlsx-js-style, pas xlsx`,
      ).not.toMatch(/from\s+["']xlsx["']/);
      expect(content).toMatch(/from\s+["']xlsx-js-style["']/);
    }
  });
});

describe("v0.30.1 PERF — lazy-load Planning Excel", () => {
  const planningSrc = readFile("src/routes/_app.planning.tsx");

  it("ne fait PAS d'import statique de planning-excel-export", () => {
    expect(planningSrc).not.toMatch(
      /^import\s+.*from\s+["']@\/lib\/planning-excel-export["']/m,
    );
  });

  it("ne fait PAS d'import statique de planning-objet-xlsx-export", () => {
    expect(planningSrc).not.toMatch(
      /^import\s+.*from\s+["']@\/lib\/planning-objet-xlsx-export["']/m,
    );
  });

  it("utilise des imports dynamiques pour les exports Excel", () => {
    expect(planningSrc).toMatch(
      /await\s+import\(["']@\/lib\/planning-excel-export["']\)/,
    );
    expect(planningSrc).toMatch(
      /import\(["']@\/lib\/planning-objet-xlsx-export["']\)/,
    );
  });
});

describe("v0.30.1 PERF — lazy-load Export hub (régression)", () => {
  const exportSrc = readFile("src/routes/_app.export.index.tsx");

  it("/export utilise toujours les imports dynamiques (pattern v0.24.1)", () => {
    expect(exportSrc).toMatch(
      /await\s+import\(["']@\/lib\/planning-excel-export["']\)/,
    );
    expect(exportSrc).toMatch(
      /await\s+import\(["']@\/lib\/planning-zip-export["']\)/,
    );
  });
});
