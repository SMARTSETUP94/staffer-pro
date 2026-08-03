/**
 * Source unique de vérité pour l'affichage des libellés de rôles.
 *
 * Lot 7.1 — Vocabulaire centralisé.
 *
 * IMPORTANT — L'enum DB `app_role` est utilisé partout (RLS, helpers SECURITY
 * DEFINER, migrations). Toute évolution du vocabulaire UI doit se faire
 * UNIQUEMENT dans ce fichier — on ne traduit qu'à l'affichage.
 *
 * L5-A (28 mai 2026) : rôle `chef_metier_scoped` retiré du code applicatif
 * (0 user assigné). La valeur reste dans l'enum DB (cleanup en dette).
 */

// ---------------------------------------------------------------------------
// Rôles applicatifs (enum DB app_role)
// ---------------------------------------------------------------------------

export type AppRole =
  | "admin"
  | "chef_chantier"
  | "rh"
  | "employe"
  // v0.49 Batch 9.7 — rôles Sprint A désormais typés côté front (cf. mem://debts/types-app-role-incomplet)
  | "commercial"
  | "bureau_etude"
  | "atelier_chef"
  | "atelier_metier"
  | "logistique"
  | "poseur"
  // Lot L2 — Chef pose
  | "chef_pose";

const USER_ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  chef_chantier: "Chef d'équipe",
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
