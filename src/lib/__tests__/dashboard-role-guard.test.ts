/**
 * v0.27.4 — Tests garde-fou rôle dashboard.
 * Couvre la fuite RGPD potentielle : un employé NE DOIT JAMAIS voir un
 * widget commerce, même si :
 *  - layout BDD corrompu lui en attribue
 *  - admin passe en preview employé
 *  - personnalisation tenterait d'en ajouter
 */
import { describe, expect, it } from "vitest";
import {
  ALL_WIDGET_IDS,
  ROLE_PRESETS,
  computePresetForRoles,
  getAllowedWidgetsForRole,
  clampLayoutToRole,
  sanitizeLayout,
  type WidgetId,
} from "@/lib/dashboard/types";

const COMMERCE_WIDGETS: WidgetId[] = [
  "kpi_top",
  "opportunites_priorite",
  "pipeline_charge_affaires",
  "pipeline_typologie",
  "conversions_recentes",
  "opportunites_perdues",
];

const OPS_ADMIN_ONLY: WidgetId[] = [
  "meteo_chantiers",
  "montages_j7",
  "tension_budget",
  "absences_semaine",
  "flotte_kpis",
];

describe("Dashboard preset par rôle — getAllowedWidgetsForRole", () => {
  it("admin a accès à TOUS les widgets", () => {
    const allowed = getAllowedWidgetsForRole("admin");
    for (const id of ALL_WIDGET_IDS) {
      expect(allowed.has(id), `admin should see ${id}`).toBe(true);
    }
  });

  it("chef_chantier n'a PAS accès aux widgets commerce", () => {
    const allowed = getAllowedWidgetsForRole("chef_chantier");
    for (const id of COMMERCE_WIDGETS) {
      expect(allowed.has(id), `chef should NOT see commerce widget ${id}`).toBe(false);
    }
  });

  it("chef_chantier a accès aux widgets ops + fab + perso", () => {
    const allowed = getAllowedWidgetsForRole("chef_chantier");
    for (const id of OPS_ADMIN_ONLY) {
      expect(allowed.has(id), `chef should see ops widget ${id}`).toBe(true);
    }
    expect(allowed.has("charge_atelier")).toBe(true);
    expect(allowed.has("mes_etapes_fab")).toBe(true);
  });

  it("employe n'a accès QU'aux widgets perso (mes_etapes_fab + heures_a_valider)", () => {
    const allowed = getAllowedWidgetsForRole("employe");
    expect(allowed.has("mes_etapes_fab")).toBe(true);
    expect(allowed.has("heures_a_valider")).toBe(true);
    // tout le reste interdit
    const interdits: WidgetId[] = [
      ...COMMERCE_WIDGETS,
      ...OPS_ADMIN_ONLY,
      "charge_atelier", "objets_en_retard", "charge_equipe", "sous_effectif_J7",
    ];
    for (const id of interdits) {
      expect(allowed.has(id), `employe MUST NOT see ${id}`).toBe(false);
    }
  });

  it("employe n'a accès qu'à exactement 2 widgets (anti-régression)", () => {
    const allowed = getAllowedWidgetsForRole("employe");
    expect(allowed.size).toBe(2);
  });
});

describe("clampLayoutToRole — defense in depth", () => {
  it("FUITE BLOQUÉE : layout BDD corrompu employé contenant tous les widgets → ne garde QUE perso", () => {
    const corrupted = { visible: [...ALL_WIDGET_IDS] };
    const clamped = clampLayoutToRole(corrupted, "employe");
    expect(clamped.visible).toEqual(["mes_etapes_fab", "heures_a_valider"]);
    expect(clamped.visible).not.toContain("opportunites_priorite");
    expect(clamped.visible).not.toContain("pipeline_charge_affaires");
    expect(clamped.visible).not.toContain("kpi_top");
  });

  it("FUITE BLOQUÉE : layout employé contenant uniquement des widgets commerce → vide", () => {
    const corrupted = { visible: COMMERCE_WIDGETS };
    const clamped = clampLayoutToRole(corrupted, "employe");
    expect(clamped.visible).toEqual([]);
  });

  it("chef_chantier : retire les widgets commerce, garde le reste", () => {
    const layout = {
      visible: ["kpi_top", "meteo_chantiers", "charge_atelier", "mes_etapes_fab"] as WidgetId[],
    };
    const clamped = clampLayoutToRole(layout, "chef_chantier");
    expect(clamped.visible).not.toContain("kpi_top");
    expect(clamped.visible).toContain("meteo_chantiers");
    expect(clamped.visible).toContain("charge_atelier");
    expect(clamped.visible).toContain("mes_etapes_fab");
  });

  it("admin : ne retire rien", () => {
    const layout = { visible: [...ALL_WIDGET_IDS] };
    const clamped = clampLayoutToRole(layout, "admin");
    expect(clamped.visible).toEqual(ALL_WIDGET_IDS);
  });

  it("clamp est idempotent (clamp(clamp(x)) === clamp(x))", () => {
    const layout = { visible: [...ALL_WIDGET_IDS] };
    const once = clampLayoutToRole(layout, "employe");
    const twice = clampLayoutToRole(once, "employe");
    expect(twice.visible).toEqual(once.visible);
  });

  it("préserve le champ hidden en le clampant aussi", () => {
    const layout = {
      visible: ["mes_etapes_fab"] as WidgetId[],
      hidden: ["kpi_top", "heures_a_valider"] as WidgetId[],
    };
    const clamped = clampLayoutToRole(layout, "employe");
    expect(clamped.hidden).not.toContain("kpi_top");
    expect(clamped.hidden).toContain("heures_a_valider");
  });
});

describe("Presets par rôle — pas de régression", () => {
  it("preset admin = tous les widgets", () => {
    expect(ROLE_PRESETS.admin).toEqual(ALL_WIDGET_IDS);
  });

  it("preset employe ne contient AUCUN widget commerce", () => {
    for (const id of COMMERCE_WIDGETS) {
      expect(ROLE_PRESETS.employe).not.toContain(id);
    }
  });

  it("preset chef_chantier ne contient AUCUN widget commerce", () => {
    for (const id of COMMERCE_WIDGETS) {
      expect(ROLE_PRESETS.chef_chantier).not.toContain(id);
    }
  });

  it("computePresetForRoles privilégie admin > chef > employe", () => {
    expect(computePresetForRoles(["admin", "employe"])).toEqual(ROLE_PRESETS.admin);
    expect(computePresetForRoles(["chef_chantier", "employe"])).toEqual(
      ROLE_PRESETS.chef_chantier,
    );
    expect(computePresetForRoles(["employe"])).toEqual(ROLE_PRESETS.employe);
    expect(computePresetForRoles([])).toEqual([]);
  });

  it("preset employe est strictement inclus dans allowed employe (cohérence)", () => {
    const allowed = getAllowedWidgetsForRole("employe");
    for (const id of ROLE_PRESETS.employe) {
      expect(allowed.has(id)).toBe(true);
    }
  });
});

describe("Scénario E2E — fuite RGPD bloquée", () => {
  it("Scénario A : employé arrive sur dashboard, layout BDD null → preset employé strict", () => {
    const visible = computePresetForRoles(["employe"]);
    const allowed = getAllowedWidgetsForRole("employe");
    const rendered = visible.filter((id) => allowed.has(id));
    expect(rendered).toEqual(["mes_etapes_fab"]);
  });

  it("Scénario B : layout BDD employé contient kpi_top (corruption) → masqué au rendu", () => {
    const stored = sanitizeLayout({ visible: ["kpi_top", "mes_etapes_fab", "pipeline_charge_affaires"] });
    expect(stored).not.toBeNull();
    const clamped = clampLayoutToRole(stored!, "employe");
    expect(clamped.visible).toEqual(["mes_etapes_fab"]);
  });

  it("Scénario C : admin en preview employé → ne voit QUE le preset employé", () => {
    // useDashboardLayout utilise computePresetForRoles([effectiveRole])
    // Quand admin passe en preview "employe_mobile" / "employe_desktop",
    // effectiveRole devient "employe".
    const previewRole = "employe" as const;
    const preset = computePresetForRoles([previewRole]);
    const allowed = getAllowedWidgetsForRole(previewRole);
    const rendered = preset.filter((id) => allowed.has(id));
    expect(rendered).toEqual(["mes_etapes_fab"]);
    expect(rendered).not.toContain("kpi_top");
    expect(rendered).not.toContain("opportunites_priorite");
  });

  it("Scénario D : Sheet Personnaliser ne propose QUE 2 widgets pour un employé", () => {
    const allowed = getAllowedWidgetsForRole("employe");
    const proposable = ALL_WIDGET_IDS.filter((id) => allowed.has(id));
    expect(proposable.length).toBe(2);
    expect(proposable).toEqual(expect.arrayContaining(["mes_etapes_fab", "heures_a_valider"]));
  });
});
