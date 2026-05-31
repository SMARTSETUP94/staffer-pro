/**
 * Garde-fou : interdit tout INSERT/UPDATE direct sur `heures_saisies` en
 * dehors de la source unique `src/lib/heures-upsert.ts` et du hook
 * `src/hooks/use-mes-heures.ts` (qui consomme le helper pour ses appels
 * batch / patch).
 *
 * Si ce test casse, c'est que quelqu'un a réintroduit du SQL direct sur
 * `heures_saisies` dans une surface de saisie. Refactor vers
 * `upsertHeuresSaisie` / `patchHeuresSaisie` / `insertHeuresSaisie`.
 */
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const ALLOWED = new Set<string>([
  "src/lib/heures-upsert.ts",
  // useMesHeures fait des opérations en lot/patch sur la grille saisie de
  // l'employé (upsert assignation_id, RPC acknowledge_rejet…). Il peut
  // appeler directement supabase mais doit router INSERT/UPDATE via le helper.
  "src/hooks/use-mes-heures.ts",
]);

describe("heures_saisies — source unique", () => {
  it("aucun .insert/.update direct sur heures_saisies hors du helper", () => {
    let output = "";
    try {
      output = execSync(
        `rg -l "from\\(\\\"heures_saisies\\\"\\).*\\.(insert|update)" src --type ts --type tsx -g '!**/__tests__/**' -g '!**/*.test.ts' || true`,
        { encoding: "utf8" },
      );
    } catch {
      // rg renvoie 1 si rien trouvé — pas une erreur ici
    }
    const files = output.split("\n").map((s) => s.trim()).filter(Boolean);
    // ripgrep est multiline-faible : on re-vérifie en lisant chaque fichier
    const fs = require("node:fs");
    const offenders = files.filter((f) => {
      if (ALLOWED.has(f)) return false;
      const src = fs.readFileSync(f, "utf8") as string;
      // motif souple : .from("heures_saisies") suivi (dans la même expression chaînée) d'un .insert(/.update(
      const matches = src.match(/from\(["']heures_saisies["']\)[\s\S]{0,200}?\.(insert|update)\(/g);
      return matches && matches.length > 0;
    });
    expect(
      offenders,
      `Surfaces utilisant un INSERT/UPDATE direct sur heures_saisies (router via src/lib/heures-upsert.ts) :\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
