/**
 * v0.41.0a — Tests de non-régression pour le bug heures invisibles côté employé.
 *
 * Couvre uniquement les invariants statiques du hook (dépendances + listeners),
 * sans monter le hook complet (qui dépend du client Supabase mocké lourdement).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "../use-mes-heures.ts"), "utf-8");

describe("use-mes-heures — invariants v0.41.0a", () => {
  it("rows useMemo dépend de affairesById + metiersById (sinon label hors planning reste figé)", () => {
    expect(SRC).toMatch(/\}, \[assignations, saisies, affairesById, metiersById\]\);/);
  });

  it("écoute visibilitychange + focus pour refetch (anti-stale après login chef)", () => {
    expect(SRC).toMatch(/addEventListener\("visibilitychange"/);
    expect(SRC).toMatch(/addEventListener\("focus"/);
    expect(SRC).toMatch(/removeEventListener\("visibilitychange"/);
    expect(SRC).toMatch(/removeEventListener\("focus"/);
  });

  it("le SELECT heures_saisies filtre par employe_id (pas par created_by ni saisi_par)", () => {
    // garde-fou : aucun filtre client/server qui exclurait les saisies chef
    expect(SRC).not.toMatch(/\.eq\("created_by"/);
    expect(SRC).not.toMatch(/\.eq\("saisi_par"/);
    expect(SRC).not.toMatch(/\.eq\("saisi_par_chef"/);
    expect(SRC).toMatch(/\.eq\("employe_id", employeId\)/);
  });
});
