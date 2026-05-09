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
  // Humanisation équipe (5) — v0.40.x
  "anniversaires",
  "saint_du_jour",
  "top_constructeur",
  "chef_projet_mois",
  "tip_du_jour",
  "quiz_du_jour",

export type WidgetId = (typeof ALL_WIDGET_IDS)[number];

export type WidgetCategory = "commerce" | "ops" | "fab" | "perso" | "fun";

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
    "anniversaires",
    "saint_du_jour",
    "top_constructeur",
    "chef_projet_mois",
    "tip_du_jour",
    "quiz_du_jour",
    "mes_etapes_fab",
    "anniversaires",
    "saint_du_jour",
    "top_constructeur",
    "chef_projet_mois",
    "tip_du_jour",
    "quiz_du_jour",

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
 * v0.27.4 — Garde-fou sécurité : ENSEMBLE des widgets AUTORISÉS pour un rôle.
 * Différent du preset par défaut : c'est la WHITELIST qui borne TOUT layout
 * (sauvegardé, preset, ou personnalisation). Empêche un employé de voir un
 * widget commercial même via :
 *  - layout corrompu en BDD
 *  - mode "Preview Employé" admin (effectiveRole=employe)
 *  - manipulation directe des données dashboard_layout
 *
 * Règle :
 *  - admin   : tous les widgets (full)
 *  - chef    : tout sauf widgets commerce strict (kpi_top, opp_*, pipeline_*, conversions_*)
 *  - employe : UNIQUEMENT widgets perso (mes_etapes_fab, heures_a_valider)
 */
export function getAllowedWidgetsForRole(role: AppRole): Set<WidgetId> {
  if (role === "admin") return new Set(ALL_WIDGET_IDS);
  const fun: WidgetId[] = ["anniversaires", "saint_du_jour", "top_constructeur", "chef_projet_mois", "tip_du_jour", "quiz_du_jour"];
  if (role === "chef_chantier") {
    return new Set<WidgetId>([
      "meteo_chantiers", "montages_j7", "tension_budget", "absences_semaine",
      "flotte_kpis", "charge_atelier", "objets_en_retard", "charge_equipe",
      "mes_etapes_fab", "heures_a_valider", "sous_effectif_J7",
      ...fun,
    ]);
  }
  // employe : widgets personnels + humanisation équipe
  return new Set<WidgetId>(["mes_etapes_fab", "heures_a_valider", ...fun]);
}

/**
 * Filtre un layout pour ne garder que les widgets autorisés au rôle donné.
 * Utilisé au rendu (defense in depth) ET au save (anti-corruption).
 */
export function clampLayoutToRole(layout: DashboardLayout, role: AppRole): DashboardLayout {
  const allowed = getAllowedWidgetsForRole(role);
  return {
    visible: layout.visible.filter((id) => allowed.has(id)),
    hidden: layout.hidden?.filter((id) => allowed.has(id)),
  };
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
