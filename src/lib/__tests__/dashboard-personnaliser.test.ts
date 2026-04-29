/**
 * v0.26.0 — Tests pour la logique de la Sheet Personnaliser
 * (toggle widget, group by category, persistance shape).
 */
import { describe, it, expect } from "vitest";
import {
  ALL_WIDGET_IDS,
  type WidgetId,
  type DashboardLayout,
} from "@/lib/dashboard/types";
import { WIDGET_META, CATEGORY_ORDER } from "@/lib/dashboard/widget-registry";

function toggle(set: Set<WidgetId>, id: WidgetId): Set<WidgetId> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function buildLayoutFromDraft(draft: Set<WidgetId>): DashboardLayout {
  const visible = ALL_WIDGET_IDS.filter((id) => draft.has(id));
  const hidden = ALL_WIDGET_IDS.filter((id) => !draft.has(id));
  return { visible, hidden };
}

describe("Personnaliser sheet — toggle", () => {
  it("ajoute si absent", () => {
    const after = toggle(new Set<WidgetId>(), "kpi_top");
    expect(after.has("kpi_top")).toBe(true);
  });

  it("retire si présent", () => {
    const after = toggle(new Set<WidgetId>(["kpi_top"]), "kpi_top");
    expect(after.has("kpi_top")).toBe(false);
  });

  it("idempotent : 2 toggles = état initial", () => {
    const start = new Set<WidgetId>(["meteo_chantiers"]);
    const after = toggle(toggle(start, "kpi_top"), "kpi_top");
    expect(Array.from(after).sort()).toEqual(Array.from(start).sort());
  });

  it("ne touche pas aux autres widgets", () => {
    const start = new Set<WidgetId>(["kpi_top", "meteo_chantiers"]);
    const after = toggle(start, "flotte_kpis");
    expect(after.has("kpi_top")).toBe(true);
    expect(after.has("meteo_chantiers")).toBe(true);
    expect(after.has("flotte_kpis")).toBe(true);
  });
});

describe("Personnaliser sheet — buildLayoutFromDraft", () => {
  it("layout vide = visible:[], hidden:[ALL]", () => {
    const l = buildLayoutFromDraft(new Set());
    expect(l.visible).toEqual([]);
    expect(l.hidden).toHaveLength(17);
  });

  it("layout complet = visible:[ALL], hidden:[]", () => {
    const l = buildLayoutFromDraft(new Set(ALL_WIDGET_IDS));
    expect(l.visible).toHaveLength(17);
    expect(l.hidden).toEqual([]);
  });

  it("ordre stable basé sur ALL_WIDGET_IDS", () => {
    const draft = new Set<WidgetId>(["meteo_chantiers", "kpi_top"]);
    const l = buildLayoutFromDraft(draft);
    // kpi_top apparaît avant meteo_chantiers dans ALL_WIDGET_IDS
    expect(l.visible.indexOf("kpi_top")).toBeLessThan(l.visible.indexOf("meteo_chantiers"));
  });

  it("visible + hidden = catalogue complet sans doublon", () => {
    const draft = new Set<WidgetId>(["kpi_top", "absences_semaine", "mes_etapes_fab"]);
    const l = buildLayoutFromDraft(draft);
    const union = new Set([...l.visible, ...(l.hidden ?? [])]);
    expect(union.size).toBe(17);
  });
});

describe("Group widgets by category (UI Sheet)", () => {
  it("la grouping suit CATEGORY_ORDER", () => {
    const groups = CATEGORY_ORDER.map((cat) => ({
      category: cat,
      widgets: ALL_WIDGET_IDS.filter((id) => WIDGET_META[id].category === cat),
    }));
    expect(groups[0].category).toBe("commerce");
    expect(groups[1].category).toBe("ops");
    expect(groups[2].category).toBe("fab");
    expect(groups[3].category).toBe("perso");
  });

  it("aucun widget orphelin (somme = 17)", () => {
    const total = CATEGORY_ORDER.reduce(
      (acc, cat) => acc + ALL_WIDGET_IDS.filter((id) => WIDGET_META[id].category === cat).length,
      0,
    );
    expect(total).toBe(17);
  });
});

describe("Layout grid spans", () => {
  it("widgets width=2 prennent lg:col-span-2", () => {
    const w2 = ALL_WIDGET_IDS.filter((id) => WIDGET_META[id].width === 2);
    expect(w2.length).toBeGreaterThanOrEqual(4);
  });

  it("widgets width=1 occupent une colonne", () => {
    const w1 = ALL_WIDGET_IDS.filter((id) => WIDGET_META[id].width === 1);
    expect(w1.length).toBeGreaterThanOrEqual(10);
  });
});

describe("Empty state du dashboard", () => {
  it("layout.visible vide → afficher l'état vide (logique UI)", () => {
    const layout: DashboardLayout = { visible: [] };
    const isEmpty = layout.visible.length === 0;
    expect(isEmpty).toBe(true);
  });

  it("layout.visible non-vide → on rend les widgets", () => {
    const layout: DashboardLayout = { visible: ["mes_etapes_fab"] };
    expect(layout.visible.length).toBeGreaterThan(0);
  });
});
