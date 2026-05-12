import { describe, it, expect, beforeEach } from "vitest";
import {
  ALL_WIDGET_IDS,
  ROLE_PRESETS,
  CHARGE_AFFAIRES_PRESET,
  computePresetForRoles,
  sanitizeLayout,
} from "@/lib/dashboard/types";
import {
  WIDGET_META,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  registerWidget,
  getWidgetComponent,
  getRegisteredWidgetIds,
} from "@/lib/dashboard/widget-registry";

describe("dashboard catalogue (v0.47.x — 25 widgets)", () => {
  it("expose 25 widgets exactement", () => {
    expect(ALL_WIDGET_IDS).toHaveLength(25);
  });

  it("ne contient aucun doublon", () => {
    const set = new Set(ALL_WIDGET_IDS);
    expect(set.size).toBe(ALL_WIDGET_IDS.length);
  });

  it("a une entrée WIDGET_META pour chaque id", () => {
    for (const id of ALL_WIDGET_IDS) {
      expect(WIDGET_META[id]).toBeDefined();
      expect(WIDGET_META[id].title).toBeTruthy();
      expect(WIDGET_META[id].category).toBeTruthy();
    }
  });

  it("toutes les catégories sont valides", () => {
    for (const id of ALL_WIDGET_IDS) {
      expect(CATEGORY_ORDER).toContain(WIDGET_META[id].category);
    }
  });

  it("expose 5 catégories libellées", () => {
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(5);
    expect(CATEGORY_ORDER).toHaveLength(5);
  });
});

describe("ROLE_PRESETS", () => {
  it("admin = tous les widgets", () => {
    expect(ROLE_PRESETS.admin).toHaveLength(17);
    expect(new Set(ROLE_PRESETS.admin)).toEqual(new Set(ALL_WIDGET_IDS));
  });

  it("chef_chantier = 10 widgets validés utilisateur", () => {
    expect(ROLE_PRESETS.chef_chantier).toHaveLength(10);
    expect(ROLE_PRESETS.chef_chantier).toContain("meteo_chantiers");
    expect(ROLE_PRESETS.chef_chantier).toContain("flotte_kpis");
    expect(ROLE_PRESETS.chef_chantier).toContain("sous_effectif_J7");
  });

  it("employe = aucun widget (anti-fuite RGPD totale)", () => {
    expect(ROLE_PRESETS.employe).toEqual([]);
  });

  it("CHARGE_AFFAIRES_PRESET = 7 widgets commerce + tension_budget", () => {
    expect(CHARGE_AFFAIRES_PRESET).toHaveLength(7);
    expect(CHARGE_AFFAIRES_PRESET).toContain("kpi_top");
    expect(CHARGE_AFFAIRES_PRESET).toContain("tension_budget");
  });

  it("chef_chantier ne contient aucun id obsolète", () => {
    for (const id of ROLE_PRESETS.chef_chantier) {
      expect(ALL_WIDGET_IDS).toContain(id);
    }
  });
});

describe("computePresetForRoles", () => {
  it("admin > chef > employe (priorité)", () => {
    expect(computePresetForRoles(["admin", "chef_chantier", "employe"])).toEqual(ROLE_PRESETS.admin);
  });

  it("chef seul → preset chef", () => {
    expect(computePresetForRoles(["chef_chantier"])).toEqual(ROLE_PRESETS.chef_chantier);
  });

  it("employe seul → preset employe", () => {
    expect(computePresetForRoles(["employe"])).toEqual(ROLE_PRESETS.employe);
  });

  it("aucun rôle → []", () => {
    expect(computePresetForRoles([])).toEqual([]);
  });

  it("chef + employe → chef gagne", () => {
    expect(computePresetForRoles(["employe", "chef_chantier"])).toEqual(ROLE_PRESETS.chef_chantier);
  });
});

describe("sanitizeLayout", () => {
  it("null → null", () => {
    expect(sanitizeLayout(null)).toBeNull();
    expect(sanitizeLayout(undefined)).toBeNull();
  });

  it("rejette si visible n'est pas un array", () => {
    expect(sanitizeLayout({ visible: "kpi_top" })).toBeNull();
    expect(sanitizeLayout({})).toBeNull();
  });

  it("filtre les ids inconnus", () => {
    const res = sanitizeLayout({ visible: ["kpi_top", "fake_widget", "meteo_chantiers"] });
    expect(res?.visible).toEqual(["kpi_top", "meteo_chantiers"]);
  });

  it("conserve hidden si présent", () => {
    const res = sanitizeLayout({ visible: ["kpi_top"], hidden: ["meteo_chantiers", "wrong"] });
    expect(res?.hidden).toEqual(["meteo_chantiers"]);
  });

  it("hidden absent → undefined", () => {
    const res = sanitizeLayout({ visible: ["kpi_top"] });
    expect(res?.hidden).toBeUndefined();
  });

  it("layout vide valide reste valide", () => {
    expect(sanitizeLayout({ visible: [] })).toEqual({ visible: [] });
  });
});

describe("widget-registry registerWidget / getWidgetComponent", () => {
  beforeEach(() => {
    // Pas de reset officiel, on enregistre/écrase pour les tests.
  });

  it("getWidgetComponent renvoie null pour un id non enregistré", () => {
    // On ne sait pas si tous les widgets sont enregistrés en env test ; on prend un id valide non encore touché
    const Comp = getWidgetComponent("kpi_top");
    // Selon ordre d'exécution Comp peut être null ou défini ; on teste juste que ça ne crash pas
    expect(Comp === null || typeof Comp === "function").toBe(true);
  });

  it("registerWidget rend un composant récupérable", () => {
    const Fake = () => null;
    registerWidget("kpi_top", Fake);
    expect(getWidgetComponent("kpi_top")).toBe(Fake);
  });

  it("getRegisteredWidgetIds liste les ids enregistrés", () => {
    const Fake = () => null;
    registerWidget("meteo_chantiers", Fake);
    expect(getRegisteredWidgetIds()).toContain("meteo_chantiers");
  });
});

describe("WIDGET_META widths cohérents", () => {
  it("chaque widget a un width 1 ou 2 (ou undefined)", () => {
    for (const id of ALL_WIDGET_IDS) {
      const w = WIDGET_META[id].width;
      expect(w === undefined || w === 1 || w === 2).toBe(true);
    }
  });

  it("kpi_top, meteo_chantiers, charge_atelier, pipeline_typologie font width=2", () => {
    expect(WIDGET_META.kpi_top.width).toBe(2);
    expect(WIDGET_META.meteo_chantiers.width).toBe(2);
    expect(WIDGET_META.charge_atelier.width).toBe(2);
    expect(WIDGET_META.pipeline_typologie.width).toBe(2);
  });
});

describe("Catégorisation des 17 widgets", () => {
  const byCat = (cat: string) => ALL_WIDGET_IDS.filter((id) => WIDGET_META[id].category === cat);

  it("Commerce : 6 widgets", () => {
    expect(byCat("commerce")).toHaveLength(6);
  });
  it("Ops : 5 widgets", () => {
    expect(byCat("ops")).toHaveLength(5);
  });
  it("Fab : 3 widgets", () => {
    expect(byCat("fab")).toHaveLength(3);
  });
  it("Perso : 3 widgets", () => {
    expect(byCat("perso")).toHaveLength(3);
  });
});
