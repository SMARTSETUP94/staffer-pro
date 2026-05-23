import { describe, it, expect } from "vitest";
import {
  roleLabel,
  previewRoleLabel,
  affaireRoleLabel,
  resolveVocab,
  USER_ROLE_OPTIONS,
  VOCAB_LABELS_LEGACY,
  VOCAB_LABELS_NEXT,
} from "@/lib/labels";

describe("labels — vocabulaire centralisé (Lot 7.1)", () => {
  describe("roleLabel (app_role)", () => {
    it("traduit chef_chantier en « Chef d'équipe »", () => {
      expect(roleLabel("chef_chantier")).toBe("Chef d'équipe");
    });

    it("traduit les autres rôles applicatifs", () => {
      expect(roleLabel("admin")).toBe("Admin");
      expect(roleLabel("chef_metier_scoped")).toBe("Chef métier (scopé)");
      expect(roleLabel("rh")).toBe("RH");
      expect(roleLabel("employe")).toBe("Employé");
    });

    it("retourne — pour null/undefined", () => {
      expect(roleLabel(null)).toBe("—");
      expect(roleLabel(undefined)).toBe("—");
    });

    it("fallback sur la clé pour un rôle inconnu", () => {
      expect(roleLabel("inconnu")).toBe("inconnu");
    });
  });

  describe("USER_ROLE_OPTIONS", () => {
    it("expose chef_chantier avec le bon libellé", () => {
      const opt = USER_ROLE_OPTIONS.find((o) => o.value === "chef_chantier");
      expect(opt?.label).toBe("Chef d'équipe");
      expect(opt?.hint).toBe("global");
    });

    it("contient les 5 rôles app_role", () => {
      expect(USER_ROLE_OPTIONS.map((o) => o.value).sort()).toEqual(
        ["admin", "chef_chantier", "chef_metier_scoped", "employe", "rh"].sort(),
      );
    });
  });

  describe("previewRoleLabel", () => {
    it("traduit chef_chantier en « Chef d'équipe »", () => {
      expect(previewRoleLabel("chef_chantier")).toBe("Chef d'équipe");
    });

    it("traduit chef_mobile et employe_mobile", () => {
      expect(previewRoleLabel("chef_mobile")).toBe("Chef mobile");
      expect(previewRoleLabel("employe_mobile")).toBe("Employé mobile");
      expect(previewRoleLabel("employe_desktop")).toBe("Employé desktop");
    });
  });

  describe("affaireRoleLabel (rôle métier sur une affaire)", () => {
    it("garde chef_chantier littéral (rôle terrain, pas le rôle applicatif)", () => {
      expect(affaireRoleLabel("chef_chantier")).toBe("Chef chantier");
    });

    it("traduit chef_projet et charge_affaires", () => {
      expect(affaireRoleLabel("chef_projet")).toBe("Chef projet");
      expect(affaireRoleLabel("charge_affaires")).toBe("Chargé affaires");
    });
  });
});
