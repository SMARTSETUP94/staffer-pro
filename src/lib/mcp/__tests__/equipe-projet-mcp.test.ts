import { describe, it, expect } from "vitest";
import { z } from "zod";
import { equipeProjet } from "../read-data";
import { opportunitePatch, writeSchemas, v2ReadSchemas } from "../write-schemas";
import { WRITE_CAPS } from "../write-policy";

describe("MCP équipe projet", () => {
  it("expose les 7 rôles avec nom et période", () => {
    const e = equipeProjet([{ role: "concepteur", employe_id: "n", date_debut: "2026-11-02", date_fin: "2026-11-04", employes: { prenom: "Nadège", nom: "X" } }]);
    expect(Object.keys(e)).toHaveLength(7);
    expect(e.concepteur).toEqual({ employe_id: "n", nom: "Nadège X", date_debut: "2026-11-02", date_fin: "2026-11-04" });
    expect(e.responsable_projet).toBeNull();
  });
  it("accepte presque_gagne sans motif", () => {
    expect(opportunitePatch.safeParse({ statut: "presque_gagne" }).success).toBe(true);
    expect(opportunitePatch.safeParse({ statut: "perdu" }).success).toBe(false);
  });
  it("accepte a_l_etude et la date de visite technique, refuse gagné/perdu", () => {
    expect(opportunitePatch.safeParse({ statut: "a_l_etude" }).success).toBe(true);
    expect(opportunitePatch.safeParse({ statut: "a_l_etude", date_visite_technique: "2026-11-12" }).success).toBe(true);
    expect(opportunitePatch.safeParse({ date_visite_technique: "12/11/2026" }).success).toBe(false);
    expect(opportunitePatch.safeParse({ statut: "gagne" }).success).toBe(false);
    expect(opportunitePatch.safeParse({ statut: "perdu" }).success).toBe(false);
  });
  it("affecter_role_projet exige affaires.edit et un rôle connu", () => {
    expect(WRITE_CAPS.affecter_role_projet).toBe("affaires.edit");
    const s = z.object(writeSchemas.affecter_role_projet);
    expect(s.safeParse({ affaire_id: crypto.randomUUID(), role: "chef_finition", employe_id: null }).success).toBe(true);
    expect(s.safeParse({ affaire_id: crypto.randomUUID(), role: "prototype", employe_id: null }).success).toBe(false);
  });
  it("planning_pilotage limite les rôles aux périodes BE / projet", () => {
    const s = z.object(v2ReadSchemas.planning_pilotage);
    expect(s.safeParse({ du: "2026-11-01", au: "2026-11-30", role: "chef_montage" }).success).toBe(false);
  });
});
