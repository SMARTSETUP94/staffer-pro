import { describe, it, expect } from "vitest";
import {
  activeEtapesFromObjets,
  buildBulkAssignPayload,
  EMPTY_BULK_ASSIGN,
  profileLabel,
  type BulkAssignSelections,
  type SelectedObjetForBulk,
} from "../bulk-assign-roles";

const objet = (
  selected: boolean,
  heures: Partial<SelectedObjetForBulk["heures"]>,
): SelectedObjetForBulk => ({
  selected,
  heures: {
    be: 0,
    numerique: 0,
    bois: 0,
    metal: 0,
    peinture: 0,
    tapisserie: 0,
    manutention: 0,
    ...heures,
  },
});

describe("activeEtapesFromObjets", () => {
  it("renvoie un set vide si aucun objet", () => {
    expect(activeEtapesFromObjets([]).size).toBe(0);
  });

  it("ignore les objets non sélectionnés", () => {
    const a = activeEtapesFromObjets([objet(false, { be: 10 })]);
    expect(a.has("be")).toBe(false);
  });

  it("active 'be' si au moins 1 objet sélectionné a heures.be > 0", () => {
    const a = activeEtapesFromObjets([objet(true, { be: 5 })]);
    expect(a.has("be")).toBe(true);
  });

  it("regroupe bois+metal sur 'respo_fab'", () => {
    expect(activeEtapesFromObjets([objet(true, { bois: 0, metal: 3 })]).has("respo_fab")).toBe(true);
    expect(activeEtapesFromObjets([objet(true, { bois: 2, metal: 0 })]).has("respo_fab")).toBe(true);
    expect(activeEtapesFromObjets([objet(true, { bois: 0, metal: 0 })]).has("respo_fab")).toBe(false);
  });

  it("regroupe peinture+tapisserie sur 'finition'", () => {
    expect(activeEtapesFromObjets([objet(true, { peinture: 1 })]).has("finition")).toBe(true);
    expect(activeEtapesFromObjets([objet(true, { tapisserie: 1 })]).has("finition")).toBe(true);
  });

  it("active 'usinage' depuis heures.numerique", () => {
    expect(activeEtapesFromObjets([objet(true, { numerique: 2 })]).has("usinage")).toBe(true);
  });

  it("active 'manutention' depuis heures.manutention", () => {
    expect(activeEtapesFromObjets([objet(true, { manutention: 1 })]).has("manutention")).toBe(true);
  });
});

describe("buildBulkAssignPayload", () => {
  it("renvoie {} si EMPTY_BULK_ASSIGN (équivalent v0.25.1)", () => {
    expect(buildBulkAssignPayload(EMPTY_BULK_ASSIGN)).toEqual({});
  });

  it("inclut chef_projet_id si fourni", () => {
    const sel: BulkAssignSelections = { ...EMPTY_BULK_ASSIGN, chefProjetId: "uuid-1" };
    expect(buildBulkAssignPayload(sel)).toEqual({ chef_projet_id: "uuid-1" });
  });

  it("inclut montage_id et demontage_id si fournis", () => {
    const sel: BulkAssignSelections = {
      ...EMPTY_BULK_ASSIGN,
      montageId: "uuid-m",
      demontageId: "uuid-d",
    };
    expect(buildBulkAssignPayload(sel)).toEqual({
      montage_id: "uuid-m",
      demontage_id: "uuid-d",
    });
  });

  it("inclut par_etape uniquement avec les étapes sélectionnées (pas les null)", () => {
    const sel: BulkAssignSelections = {
      ...EMPTY_BULK_ASSIGN,
      parEtape: { be: "uuid-be", usinage: null, respo_fab: "uuid-rf", finition: null, manutention: null },
    };
    expect(buildBulkAssignPayload(sel)).toEqual({
      par_etape: { be: "uuid-be", respo_fab: "uuid-rf" },
    });
  });

  it("ne crée pas la clé par_etape si toutes les étapes sont null", () => {
    expect(buildBulkAssignPayload(EMPTY_BULK_ASSIGN)).not.toHaveProperty("par_etape");
  });

  it("payload combiné chef_projet + M/D + 5 étapes", () => {
    const sel: BulkAssignSelections = {
      chefProjetId: "cp",
      montageId: "m",
      demontageId: "d",
      parEtape: {
        be: "be1",
        usinage: "us1",
        respo_fab: "rf1",
        finition: "fi1",
        manutention: "mn1",
      },
    };
    expect(buildBulkAssignPayload(sel)).toEqual({
      chef_projet_id: "cp",
      montage_id: "m",
      demontage_id: "d",
      par_etape: { be: "be1", usinage: "us1", respo_fab: "rf1", finition: "fi1", manutention: "mn1" },
    });
  });
});

describe("profileLabel", () => {
  it("préfère full_name", () => {
    expect(profileLabel({ id: "1", full_name: "Jean Dupont", email: "j@x.com" })).toBe("Jean Dupont");
  });
  it("fallback email si full_name vide", () => {
    expect(profileLabel({ id: "1", full_name: null, email: "j@x.com" })).toBe("j@x.com");
    expect(profileLabel({ id: "1", full_name: "  ", email: "j@x.com" })).toBe("j@x.com");
  });
});
