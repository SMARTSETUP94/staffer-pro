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

  describe("vocab métier (Lot 7.1 bis)", () => {
    it("resolveVocab(flag=true) renvoie les NOUVEAUX libellés", () => {
      expect(resolveVocab("assignerEnLot", true)).toBe("Assigner en lot");
      expect(resolveVocab("autoRemplir", true)).toBe("Auto-remplir");
      expect(resolveVocab("planDeFab", true)).toBe("Plan de fab");
      expect(resolveVocab("validerHeures", true)).toBe("Valider heures");
    });

    it("resolveVocab(flag=false) renvoie les libellés LEGACY (rollback)", () => {
      expect(resolveVocab("assignerEnLot", false)).toBe("Staffer en bulk");
      expect(resolveVocab("autoRemplir", false)).toBe("Auto-staffing");
      expect(resolveVocab("planDeFab", false)).toBe("Plan staffing");
      expect(resolveVocab("validerHeures", false)).toBe("Validation heures");
    });

    it("Express n'apparaît dans aucune map (volontairement conservé tel quel)", () => {
      const allLabels = [
        ...Object.values(VOCAB_LABELS_NEXT),
        ...Object.values(VOCAB_LABELS_LEGACY),
      ].join(" | ");
      expect(allLabels).not.toMatch(/Express/);
    });

    it("NEXT et LEGACY ont exactement les mêmes clés", () => {
      expect(Object.keys(VOCAB_LABELS_NEXT).sort()).toEqual(
        Object.keys(VOCAB_LABELS_LEGACY).sort(),
      );
    });
  });
});

