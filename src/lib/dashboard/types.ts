import type { AppRole } from "@/lib/auth-context";

/**
 * v0.26.0 — Catalogue des widgets dashboard.
 * 17 widgets : 8 existants identifiés + 5 existants découverts (no-regression) + 4 nouveaux.
 */
export const ALL_WIDGET_IDS = [
  // Commerce (6)
  "kpi_top",
  "opportunites_priorite",
  "pipeline_charge_affaires",
  "pipeline_typologie",
  "conversions_recentes",
  "opportunites_perdues",
  // Opérationnel (5)
  "meteo_chantiers",
  "montages_j7",
  "tension_budget",
  "absences_semaine",
  "flotte_kpis",
  // Fabrication (3)
  "charge_atelier",
  "objets_en_retard",
  "charge_equipe",
  // Personnel (3)
  "mes_etapes_fab",
  "heures_a_valider",
  "sous_effectif_J7",
] as const;

export type WidgetId = (typeof ALL_WIDGET_IDS)[number];

export type WidgetCategory = "commerce" | "ops" | "fab" | "perso";

export interface DashboardLayout {
  visible: WidgetId[];
  hidden?: WidgetId[];
}

/**
 * Presets par défaut pour chaque rôle (premier login → fallback si dashboard_layout NULL).
 * Validés utilisateur (catalogue élargi v0.26.0).
 */
export const ROLE_PRESETS: Record<AppRole, WidgetId[]> = {
  admin: [...ALL_WIDGET_IDS],
  chef_chantier: [
    "meteo_chantiers",
    "montages_j7",
    "tension_budget",
    "absences_semaine",
    "charge_equipe",
    "flotte_kpis",
    "mes_etapes_fab",
    "heures_a_valider",
    "sous_effectif_J7",
    "objets_en_retard",
  ],
  employe: ["mes_etapes_fab"],
};

/**
 * Le rôle "chargé d'affaires" n'existe pas encore comme AppRole distinct.
 * On le détecte via la présence dans la table charges_affaires (hook séparé).
 * Preset proposé pour usage futur :
 */
export const CHARGE_AFFAIRES_PRESET: WidgetId[] = [
  "kpi_top",
  "pipeline_charge_affaires",
  "opportunites_priorite",
  "pipeline_typologie",
  "conversions_recentes",
  "opportunites_perdues",
  "tension_budget",
];

/**
 * Calcule le preset d'un utilisateur selon son rôle principal.
 * Admin > chef_chantier > employe (ordre de priorité).
 */
export function computePresetForRoles(roles: AppRole[]): WidgetId[] {
  if (roles.includes("admin")) return ROLE_PRESETS.admin;
  if (roles.includes("chef_chantier")) return ROLE_PRESETS.chef_chantier;
  if (roles.includes("employe")) return ROLE_PRESETS.employe;
  return [];
}

/**
 * Valide un layout chargé depuis la BDD (filtre les WidgetId obsolètes).
 */
export function sanitizeLayout(raw: unknown): DashboardLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { visible?: unknown; hidden?: unknown };
  if (!Array.isArray(obj.visible)) return null;
  const validIds = new Set<string>(ALL_WIDGET_IDS);
  const visible = obj.visible.filter((x): x is WidgetId =>
    typeof x === "string" && validIds.has(x),
  );
  const hidden = Array.isArray(obj.hidden)
    ? obj.hidden.filter((x): x is WidgetId => typeof x === "string" && validIds.has(x))
    : undefined;
  return { visible, hidden };
}
