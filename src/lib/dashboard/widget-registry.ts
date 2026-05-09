import type { ComponentType } from "react";
import type { WidgetId, WidgetCategory } from "./types";

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  description: string;
  category: WidgetCategory;
  /** colspan recommandé sur grid lg:grid-cols-2 (1 ou 2). */
  width?: 1 | 2;
}

/**
 * Métadonnées seules (pas le composant React).
 * Utilisé par la Sheet "Personnaliser" pour afficher la liste sans charger les widgets.
 */
export const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  // Commerce
  kpi_top: {
    id: "kpi_top",
    title: "Tuiles KPI",
    description: "À traiter / Envoyées / Gagnées ce mois",
    category: "commerce",
    width: 2,
  },
  opportunites_priorite: {
    id: "opportunites_priorite",
    title: "À traiter en priorité",
    description: "Opportunités en tension (à faire +24h, envoyées +3j)",
    category: "commerce",
    width: 1,
  },
  pipeline_charge_affaires: {
    id: "pipeline_charge_affaires",
    title: "Pipeline par chargé d'affaires",
    description: "Bar chart empilé par taille d'opportunité",
    category: "commerce",
    width: 1,
  },
  pipeline_typologie: {
    id: "pipeline_typologie",
    title: "Pipeline par typologie",
    description: "Répartition par typologie de chantier",
    category: "commerce",
    width: 2,
  },
  conversions_recentes: {
    id: "conversions_recentes",
    title: "Conversions récentes",
    description: "5 dernières opportunités gagnées",
    category: "commerce",
    width: 1,
  },
  opportunites_perdues: {
    id: "opportunites_perdues",
    title: "Opportunités perdues",
    description: "5 dernières pertes",
    category: "commerce",
    width: 1,
  },
  // Ops
  meteo_chantiers: {
    id: "meteo_chantiers",
    title: "Météo chantiers",
    description: "Chantiers staffés J / J+1 / J+2",
    category: "ops",
    width: 2,
  },
  montages_j7: {
    id: "montages_j7",
    title: "Prochains montages & démontages",
    description: "Événements J+7",
    category: "ops",
    width: 1,
  },
  tension_budget: {
    id: "tension_budget",
    title: "Top affaires en tension budget",
    description: "Affaires consommant ≥ 80% du prévu",
    category: "ops",
    width: 1,
  },
  absences_semaine: {
    id: "absences_semaine",
    title: "Absences cette semaine",
    description: "Congés / arrêts / autres absences",
    category: "ops",
    width: 1,
  },
  flotte_kpis: {
    id: "flotte_kpis",
    title: "Flotte",
    description: "Véhicules en service + alertes CT/révision/assurance",
    category: "ops",
    width: 1,
  },
  // Fab
  charge_atelier: {
    id: "charge_atelier",
    title: "Charge atelier par pôle",
    description: "BE / Numérique / Bois / Métal / Peinture / Tap / Manu",
    category: "fab",
    width: 2,
  },
  objets_en_retard: {
    id: "objets_en_retard",
    title: "Objets en retard",
    description: "Étapes en cours sans avancement depuis +14j",
    category: "fab",
    width: 1,
  },
  charge_equipe: {
    id: "charge_equipe",
    title: "Charge équipe — semaine",
    description: "Heures par métier × type de contrat + CDI sans affectation",
    category: "fab",
    width: 1,
  },
  // Perso
  mes_etapes_fab: {
    id: "mes_etapes_fab",
    title: "Mes étapes fab",
    description: "Étapes assignées à moi, triées par urgence",
    category: "perso",
    width: 1,
  },
  heures_a_valider: {
    id: "heures_a_valider",
    title: "Heures à valider",
    description: "Saisies en attente de validation",
    category: "perso",
    width: 1,
  },
  sous_effectif_J7: {
    id: "sous_effectif_J7",
    title: "Sous-effectif J+7",
    description: "Alerte si capacité dispo < heures prévues sur 7 prochains jours",
    category: "perso",
    width: 1,
  },
  // Humanisation équipe (5) — v0.40.x
  anniversaires: {
    id: "anniversaires",
    title: "Anniversaires du jour",
    description: "Bon anniversaire aux employés du jour 🎂",
    category: "fun",
    width: 1,
  },
  saint_du_jour: {
    id: "saint_du_jour",
    title: "Bonne fête !",
    description: "Match prénom employé ↔ saint du jour",
    category: "fun",
    width: 1,
  },
  top_constructeur: {
    id: "top_constructeur",
    title: "Top constructeur de la semaine",
    description: "Top heures validées atelier (reset chaque lundi)",
    category: "fun",
    width: 1,
  },
  chef_projet_mois: {
    id: "chef_projet_mois",
    title: "Chef projet du mois",
    description: "Meilleur ratio livraisons à temps (reset 1er du mois)",
    category: "fun",
    width: 1,
  },
  tip_du_jour: {
    id: "tip_du_jour",
    title: "Astuce de la semaine",
    description: "Astuce produit, rotation hebdomadaire",
    category: "fun",
    width: 1,
  },
  quiz_du_jour: {
    id: "quiz_du_jour",
    title: "Quiz du jour",
    description: "Question scéno/menuiserie/sécurité, rotation quotidienne",
    category: "fun",
    width: 1,
  },
};

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  commerce: "Commerce",
  ops: "Opérationnel",
  fab: "Fabrication",
  perso: "Personnel",
  fun: "Cohésion équipe",
};

export const CATEGORY_ORDER: WidgetCategory[] = ["commerce", "ops", "fab", "perso", "fun"];

/**
 * Registre dynamique des composants widgets.
 * Rempli par le module widget-components.tsx (lazy import pour code-splitting éventuel).
 */
export type WidgetComponent = ComponentType<Record<string, never>>;

const componentRegistry = new Map<WidgetId, WidgetComponent>();

export function registerWidget(id: WidgetId, component: WidgetComponent): void {
  componentRegistry.set(id, component);
}

export function getWidgetComponent(id: WidgetId): WidgetComponent | null {
  return componentRegistry.get(id) ?? null;
}

export function getRegisteredWidgetIds(): WidgetId[] {
  return Array.from(componentRegistry.keys());
}
