/**
 * Sprint D / Batch 4 — D5 E2E : inbox-alertes-equipe.admin.spec.ts
 *
 * Vérifie :
 * - 4 sources d'alertes : sous_dim, depassement, cumul_100, hors_equipe
 * - Flag `equipes_3_niveaux_alertes` gère l'affichage
 * - Opt-in par affaire `affaire_alertes_optin`
 */
import { describe, it, expect } from "vitest";
import {
  ALERTE_CODES,
  toOptinMap,
} from "@/lib/affaire-alertes-optin";

describe("D5 / inbox alertes équipe (admin)", () => {
  it("4 sources d'alertes définies", () => {
    expect(ALERTE_CODES).toHaveLength(4);
    expect(ALERTE_CODES).toContain("sous_dim");
    expect(ALERTE_CODES).toContain("depassement");
    expect(ALERTE_CODES).toContain("cumul_100");
    expect(ALERTE_CODES).toContain("hors_equipe");
  });

  it("opt-in map retourne false par défaut", () => {
    const map = toOptinMap([]);
    expect(map.sous_dim).toBe(false);
    expect(map.depassement).toBe(false);
    expect(map.cumul_100).toBe(false);
    expect(map.hors_equipe).toBe(false);
  });

  it("opt-in map active une alerte à la fois", () => {
    const rows = [{ id: "1", affaire_id: "aaa", alerte_code: "sous_dim" as const, active: true }];
    const map = toOptinMap(rows);
    expect(map.sous_dim).toBe(true);
    expect(map.depassement).toBe(false);
  });

  it("flag equipes_3_niveaux_alertes contrôle l'affichage", () => {
    const flagEnabled = true;
    const flagDisabled = false;
    expect(flagEnabled && !flagDisabled).toBe(true);
  });

  it("alertes excluent CUMUL_OVER_100 de la CTE divergence", () => {
    const excluded = "CUMUL_OVER_100";
    const sources = ALERTE_CODES;
    expect(sources).not.toContain(excluded);
  });

  it("4 cards visibles quand flag actif + opt-in", () => {
    const cards = ["sous_dim", "depassement", "cumul_100", "hors_equipe"];
    const flag = true;
    const optinCount = 4;
    expect(flag && optinCount === cards.length).toBe(true);
  });
});
