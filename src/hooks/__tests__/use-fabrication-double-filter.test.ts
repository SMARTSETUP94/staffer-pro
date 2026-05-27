/**
 * L3a — Double-filtre fabrication.
 *
 * Vérifie que `isEligibleForEtape` exige À LA FOIS le flag métier sur le profil
 * (ex: est_respo_fab) ET la capability `casting.edit_phase_fabrication`
 * (résumée par `has_cap_fab_edit` côté UI).
 *
 * Garde-fou contre une incohérence DB : un poseur peut avoir hérité d'un flag
 * legacy `est_respo_fab=true` mais ne possède pas la cap → ne doit pas être
 * éligible. À l'inverse, un atelier_chef avec flag + cap est éligible.
 */
import { describe, expect, it } from "vitest";
import {
  isEligibleForEtape,
  type ProfileRole,
} from "../use-fabrication";

function makeProfile(overrides: Partial<ProfileRole> = {}): ProfileRole {
  return {
    id: "p-" + Math.random().toString(36).slice(2, 8),
    full_name: "Test User",
    email: "test@example.com",
    est_chef_projet: false,
    est_respo_fab: false,
    est_finition: false,
    est_manutention: false,
    est_bureau_etude: false,
    est_usinage_numerique: false,
    has_cap_fab_edit: false,
    ...overrides,
  };
}

describe("isEligibleForEtape — double-filtre L3a", () => {
  it("poseur avec flag respo_fab MAIS sans cap → non éligible (garde-fou)", () => {
    const poseur = makeProfile({
      full_name: "Poseur Legacy",
      est_respo_fab: true,
      has_cap_fab_edit: false,
    });
    expect(isEligibleForEtape(poseur, "respo_fab")).toBe(false);
  });

  it("atelier_chef avec flag respo_fab ET cap → éligible", () => {
    const atelierChef = makeProfile({
      full_name: "Atelier Chef",
      est_respo_fab: true,
      has_cap_fab_edit: true,
    });
    expect(isEligibleForEtape(atelierChef, "respo_fab")).toBe(true);
  });

  it("cap sans flag métier → non éligible (la cap seule ne suffit pas)", () => {
    const admin = makeProfile({
      full_name: "Admin sans flag fab",
      has_cap_fab_edit: true,
      // tous les est_* à false
    });
    expect(isEligibleForEtape(admin, "respo_fab")).toBe(false);
    expect(isEligibleForEtape(admin, "be")).toBe(false);
    expect(isEligibleForEtape(admin, "finition")).toBe(false);
  });

  it("filtre s'applique à toutes les étapes (be / usinage / finition / manutention)", () => {
    const cases: Array<{
      etape: Parameters<typeof isEligibleForEtape>[1];
      flag: keyof ProfileRole;
    }> = [
      { etape: "be", flag: "est_bureau_etude" },
      { etape: "usinage", flag: "est_usinage_numerique" },
      { etape: "finition", flag: "est_finition" },
      { etape: "manutention", flag: "est_manutention" },
    ];
    for (const { etape, flag } of cases) {
      // flag sans cap → KO
      const noCap = makeProfile({ [flag]: true, has_cap_fab_edit: false } as Partial<ProfileRole>);
      expect(isEligibleForEtape(noCap, etape)).toBe(false);
      // flag + cap → OK
      const ok = makeProfile({ [flag]: true, has_cap_fab_edit: true } as Partial<ProfileRole>);
      expect(isEligibleForEtape(ok, etape)).toBe(true);
    }
  });
});
