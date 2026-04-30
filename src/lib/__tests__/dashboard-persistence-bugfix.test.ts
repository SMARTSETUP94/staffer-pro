/**
 * v0.27.6 — Tests de régression pour le bug "personnalisation non persistée".
 *
 * Bug racine : le hook useDashboardLayout traitait `visible.length === 0`
 * comme "jamais sauvegardé" et retombait sur le preset par défaut. Un user
 * qui décochait tous les widgets retrouvait son preset au reload.
 *
 * Fix : on distingue le rawLayout NULL en BDD (vraiment jamais sauvegardé)
 * du layout sauvegardé avec visible=[] (choix utilisateur explicite).
 */
import { describe, it, expect } from "vitest";
import { sanitizeLayout, clampLayoutToRole, type DashboardLayout } from "@/lib/dashboard/types";

/**
 * Reproduction de la logique de discrimination du hook (lignes ~52-66).
 * Si on change la logique du hook, ces tests doivent être mis à jour en conséquence.
 */
function decideLayout(
  rawLayout: unknown,
  presetFn: () => DashboardLayout,
): { layout: DashboardLayout; isPreset: boolean } {
  const stored = sanitizeLayout(rawLayout);
  if (rawLayout != null && stored) {
    return { layout: stored, isPreset: false };
  }
  return { layout: presetFn(), isPreset: true };
}

describe("v0.27.6 — persistance dashboard_layout (bug fix)", () => {
  const adminPreset = (): DashboardLayout => ({
    visible: ["kpi_top", "meteo_chantiers", "mes_etapes_fab"],
  });

  it("rawLayout NULL en BDD → fallback preset (jamais sauvegardé)", () => {
    const { layout, isPreset } = decideLayout(null, adminPreset);
    expect(isPreset).toBe(true);
    expect(layout.visible).toEqual(["kpi_top", "meteo_chantiers", "mes_etapes_fab"]);
  });

  it("rawLayout undefined en BDD → fallback preset", () => {
    const { layout, isPreset } = decideLayout(undefined, adminPreset);
    expect(isPreset).toBe(true);
    expect(layout.visible.length).toBeGreaterThan(0);
  });

  it("BUG FIX : layout sauvegardé avec visible=[] doit être respecté (pas de fallback preset)", () => {
    const stored = { visible: [], hidden: ["kpi_top", "meteo_chantiers"] };
    const { layout, isPreset } = decideLayout(stored, adminPreset);
    expect(isPreset).toBe(false);
    expect(layout.visible).toEqual([]);
  });

  it("layout sauvegardé avec un widget → respecté", () => {
    const stored = { visible: ["kpi_top"], hidden: [] };
    const { layout, isPreset } = decideLayout(stored, adminPreset);
    expect(isPreset).toBe(false);
    expect(layout.visible).toEqual(["kpi_top"]);
  });

  it("layout corrompu (visible non-array) → fallback preset", () => {
    const corrupted = { visible: "not-an-array" };
    const { layout, isPreset } = decideLayout(corrupted, adminPreset);
    expect(isPreset).toBe(true);
    expect(layout.visible.length).toBeGreaterThan(0);
  });

  it("layout reproduisant exactement le cas Gabin (admin, tout décoché)", () => {
    // Snapshot réel BDD smart@setup.paris au moment du bug
    const stored = {
      hidden: [
        "kpi_top", "opportunites_priorite", "pipeline_charge_affaires",
        "pipeline_typologie", "conversions_recentes", "opportunites_perdues",
        "meteo_chantiers", "montages_j7", "tension_budget", "absences_semaine",
        "flotte_kpis", "charge_atelier", "objets_en_retard", "charge_equipe",
        "mes_etapes_fab", "heures_a_valider", "sous_effectif_J7",
      ],
      visible: [],
    };
    const { layout, isPreset } = decideLayout(stored, adminPreset);
    // AVANT fix : isPreset=true, layout.visible=preset → user reperdait sa config
    // APRÈS fix : isPreset=false, layout.visible=[] → user voit son dashboard vide
    expect(isPreset).toBe(false);
    expect(layout.visible).toEqual([]);
  });

  it("clampLayoutToRole sur layout vide reste vide (pas de regression preset)", () => {
    const empty: DashboardLayout = { visible: [], hidden: [] };
    const clamped = clampLayoutToRole(empty, "employe");
    expect(clamped.visible).toEqual([]);
  });
});

describe("v0.27.6 — gestion erreur save", () => {
  it("rollback layout local si UPDATE échoue (logique attendue)", () => {
    // Simulation : on documente le contrat du hook.
    // Le test réel passe par le mock supabase dans dashboard-layout.test.ts.
    let layout: DashboardLayout = { visible: ["kpi_top"] };
    const previous = layout;
    const next: DashboardLayout = { visible: [] };

    // Optimistic update
    layout = next;
    expect(layout.visible).toEqual([]);

    // Simule échec → rollback
    const error = { message: "permission denied" };
    if (error) {
      layout = previous;
    }
    expect(layout.visible).toEqual(["kpi_top"]);
  });
});
