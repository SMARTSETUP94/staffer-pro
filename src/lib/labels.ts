/**
 * Source unique de vérité pour l'affichage des libellés de rôles.
 *
 * Lot 7.1 — Vocabulaire centralisé.
 *
 * IMPORTANT — L'enum DB `app_role` (admin / chef_chantier / chef_metier_scoped /
 * rh / employe) reste INCHANGÉ. Toute la chaîne RLS + 9 migrations + 7 helpers
 * SECURITY DEFINER (is_admin, is_chef_or_admin, has_role, etc.) dépend de cette
 * valeur littérale. On ne traduit qu'à l'affichage.
 *
 * Pour faire évoluer le vocabulaire UI à l'avenir : modifier UNIQUEMENT ce fichier.
 */

// ---------------------------------------------------------------------------
// Rôles applicatifs (enum DB app_role)
// ---------------------------------------------------------------------------

export type AppRole =
  | "admin"
  | "chef_chantier"
  | "chef_metier_scoped"
  | "rh"
  | "employe"
  // v0.49 Batch 9.7 — rôles Sprint A désormais typés côté front (cf. mem://debts/types-app-role-incomplet)
  | "commercial"
  | "bureau_etude"
  | "atelier_chef"
  | "atelier_metier"
  | "logistique"
  | "poseur"
  // Lot L2 — nouveau rôle "Chef pose" (assignation manuelle post-L5)
  | "chef_pose";

const USER_ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  chef_chantier: "Chef d'équipe",
  chef_metier_scoped: "Chef métier (scopé)",
  rh: "RH",
  employe: "Employé",
  commercial: "Commercial",
  bureau_etude: "Bureau d'étude",
  atelier_chef: "Chef d'atelier",
  atelier_metier: "Atelier (métier)",
  logistique: "Logistique",
  poseur: "Poseur",
  chef_pose: "Chef pose",
};


/** Libellé d'affichage pour un rôle applicatif. Fallback = la clé brute. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return USER_ROLE_LABELS[role as AppRole] ?? role;
}

/** Liste ordonnée des rôles pour les <Select> admin. */
export const USER_ROLE_OPTIONS: { value: AppRole; label: string; hint?: string }[] = [
  { value: "admin", label: USER_ROLE_LABELS.admin },
  { value: "commercial", label: USER_ROLE_LABELS.commercial },
  { value: "bureau_etude", label: USER_ROLE_LABELS.bureau_etude },
  { value: "chef_chantier", label: USER_ROLE_LABELS.chef_chantier, hint: "global" },
  { value: "atelier_chef", label: USER_ROLE_LABELS.atelier_chef, hint: "métier" },
  { value: "atelier_metier", label: USER_ROLE_LABELS.atelier_metier },
  { value: "chef_pose", label: "Chef pose" },
  { value: "poseur", label: USER_ROLE_LABELS.poseur },
  { value: "logistique", label: USER_ROLE_LABELS.logistique },
  { value: "rh", label: USER_ROLE_LABELS.rh },
  { value: "employe", label: USER_ROLE_LABELS.employe },
  { value: "chef_metier_scoped", label: USER_ROLE_LABELS.chef_metier_scoped, hint: "déprécié" },
];

// ---------------------------------------------------------------------------
// Rôles de preview (admin "Voir comme") — superset de AppRole côté UI
// ---------------------------------------------------------------------------

export type PreviewRoleKey =
  | "admin"
  | "chef_chantier"
  | "chef_mobile"
  | "employe_desktop"
  | "employe_mobile";

const PREVIEW_ROLE_LABELS: Record<PreviewRoleKey, string> = {
  admin: "Admin",
  chef_chantier: "Chef d'équipe",
  chef_mobile: "Chef mobile",
  employe_desktop: "Employé desktop",
  employe_mobile: "Employé mobile",
};

export function previewRoleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return PREVIEW_ROLE_LABELS[role as PreviewRoleKey] ?? role;
}

// ---------------------------------------------------------------------------
// Rôles MÉTIER sur une affaire (chef_projet, chef_chantier sur l'affaire,
// charge_affaires, etc.) — domaine différent de app_role.
//
// Ici "chef_chantier" garde son sens littéral de "chef de chantier sur le
// site", ce n'est pas le rôle applicatif. On le laisse explicite.
// ---------------------------------------------------------------------------

const AFFAIRE_ROLE_LABELS: Record<string, string> = {
  chef_projet: "Chef projet",
  chef_chantier: "Chef chantier",
  charge_affaires: "Chargé affaires",
  responsable_montage: "Resp. montage",
  responsable_demontage: "Resp. démontage",
  respo_fab: "Resp. fab",
};

export function affaireRoleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return AFFAIRE_ROLE_LABELS[role] ?? role;
}

// ---------------------------------------------------------------------------
// Vocabulaire métier 2026 (Lot 7.1 bis) — gated by feature flag vocab_metier_v1
//
// Règle : « Express » est conservé tel quel (mot français court et compris :
// TGV Express, livraison Express). Les autres termes anglo-techniques
// (Staffer, Auto-staffing) sont francisés vers Assigner / Auto-remplir.
//
// LEGACY = chaîne actuelle (rollback si flag off).
// NEXT   = nouvelle chaîne (affichée si flag on).
//
// Cleanup deadline : 2 semaines après bascule enabled_globally=true.
// Au-delà : supprimer VOCAB_LABELS_LEGACY + simplifier useVocab() en
// retournant directement VOCAB_LABELS_NEXT.
// ---------------------------------------------------------------------------

export type VocabKey =
  | "assignerEnLot"            // ex-"Staffer en bulk"
  | "assignerPonctuel"         // ex-"Staffer rapide"
  | "assignerPonctuelCourt"    // sidebar serrée
  | "autoRemplir"              // ex-"Auto-staffing" (overline / inline)
  | "autoRemplirComplet"       // ex-"Auto-staff complet" (bouton)
  | "autoRemplirPlanComplet"   // ex-"Auto-staff plan complet"
  | "autoRemplirTermine"       // ex-"Auto-staff terminé"
  | "autoRemplirStepLabel"     // étape de progression ex-"Auto-staff"
  | "autoRemplirFabrication"   // ex-"Auto-staffing fabrication"
  | "autoRemplirFabrication5XXX" // ex-"Auto-staffing Fabrication 5XXX"
  | "planDeFab"                // ex-"Plan staffing"
  | "validerHeures"            // sidebar court
  | "validerHeuresLong"        // meta title / page;

export const VOCAB_LABELS_NEXT: Record<VocabKey, string> = {
  assignerEnLot: "Assigner en lot",
  assignerPonctuel: "Assigner ponctuel",
  assignerPonctuelCourt: "Assigner vite",
  autoRemplir: "Auto-remplir",
  autoRemplirComplet: "Auto-remplir complet",
  autoRemplirPlanComplet: "Auto-remplir plan complet",
  autoRemplirTermine: "Auto-remplir terminé",
  autoRemplirStepLabel: "Auto-remplir",
  autoRemplirFabrication: "Auto-remplir fabrication",
  autoRemplirFabrication5XXX: "Auto-remplir Fabrication 5XXX",
  planDeFab: "Plan de fab",
  validerHeures: "Valider heures",
  validerHeuresLong: "Valider les heures de l'équipe",
};

export const VOCAB_LABELS_LEGACY: Record<VocabKey, string> = {
  assignerEnLot: "Staffer en bulk",
  assignerPonctuel: "Staffer rapide",
  assignerPonctuelCourt: "Staffer rapide",
  autoRemplir: "Auto-staffing",
  autoRemplirComplet: "Auto-staff complet",
  autoRemplirPlanComplet: "Auto-staff plan complet",
  autoRemplirTermine: "Auto-staff terminé",
  autoRemplirStepLabel: "Auto-staff",
  autoRemplirFabrication: "Auto-staffing fabrication",
  autoRemplirFabrication5XXX: "Auto-staffing Fabrication 5XXX",
  planDeFab: "Plan staffing",
  validerHeures: "Validation heures",
  validerHeuresLong: "Validation heures",
};

/**
 * Résout un libellé vocab en fonction de l'état du flag vocab_metier_v1.
 * Pour usage NON-React (head/meta, server). Pour les composants, préférer
 * useVocab() qui se branche sur le hook useFeatureFlag.
 */
export function resolveVocab(key: VocabKey, flagEnabled: boolean): string {
  return flagEnabled ? VOCAB_LABELS_NEXT[key] : VOCAB_LABELS_LEGACY[key];
}
