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
  | "employe";

const USER_ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  chef_chantier: "Chef d'équipe",
  chef_metier_scoped: "Chef métier (scopé)",
  rh: "RH",
  employe: "Employé",
};

/** Libellé d'affichage pour un rôle applicatif. Fallback = la clé brute. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return USER_ROLE_LABELS[role as AppRole] ?? role;
}

/** Liste ordonnée des rôles pour les <Select> admin. */
export const USER_ROLE_OPTIONS: { value: AppRole; label: string; hint?: string }[] = [
  { value: "admin", label: USER_ROLE_LABELS.admin },
  { value: "chef_chantier", label: USER_ROLE_LABELS.chef_chantier, hint: "global" },
  { value: "chef_metier_scoped", label: USER_ROLE_LABELS.chef_metier_scoped, hint: "scopé" },
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
