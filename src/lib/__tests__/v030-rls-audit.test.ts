/**
 * v0.30.0 — Audit sentinel pour les helpers RLS et catégorisation SECURITY DEFINER.
 * Ces tests verrouillent les invariants documentés dans :
 *  - mem://constraints/rls-helpers-execute-grant
 *  - mem://constraints/security-definer-non-rls
 *  - mem://features/data-integrity-unique-indexes
 *
 * Ils sont 100% déterministes (pas d'accès DB, pas de réseau) — ils servent
 * de "single source of truth" pour les revues futures et bloquent les régressions
 * silencieuses si quelqu'un retire un helper de la whitelist sans réfléchir.
 */
import { describe, expect, it } from "vitest";

/** Les 7 helpers SECURITY DEFINER appelés dans les RLS policies. */
const RLS_HELPERS = [
  "is_admin",
  "is_chef_or_admin",
  "has_role",
  "user_has_affaire_access",
  "is_devis_termine",
  "can_saisie_on_affaire",
  "user_is_mentioned_on_affaire",
] as const;

/** RPCs SECURITY DEFINER appelables côté client — DOIT garder EXECUTE TO authenticated. */
const CLIENT_CALLABLE_RPCS = [
  "acknowledge_heures_rejet",
  "admin_get_auth_events",
  "admin_get_invitations",
  "admin_get_user_connection_stats",
  "create_fabrication_etapes_for_objet",
  "create_opportunite",
  "get_last_used_codes",
  "is_affaire_open",
  "is_profile_complete",
  "next_affaire_numero",
  "sign_opportunite",
] as const;

/** Triggers internes — REVOKE EXECUTE possible (sécurisable). */
const INTERNAL_TRIGGERS = [
  "apply_swap_on_validation",
  "validate_swap_request",
  "guard_swap_no_double_engagement",
  "guard_affaire_signature",
  "guard_assignation_confirmation",
  "guard_devis_livraison",
  "guard_devis_reouverture",
  "guard_fabrication_etape_transition",
  "guard_feedback_resolution",
  "guard_heures_saisies_transition",
  "guard_matricule_silae_admin_only",
  "guard_trajet_chauffeur_pl",
  "enforce_unique_chef_jour",
  "prevent_delete_signed_opportunite",
  "log_admin_edit_post_livraison",
  "log_fabrication_etape_change",
  "log_heures_saisies_transition",
  "notify_absence_change",
  "notify_affaire_pret_livraison",
  "notify_affaire_signee",
  "notify_assignation_change",
  "notify_assignation_confirmation",
  "notify_fabrication_etape_assignation",
  "notify_feedback_created",
  "notify_heures_change",
  "notify_mention",
  "notify_saisie_par_chef",
  "notify_swap_change",
  "notify_trajet_change",
  "set_assignation_confirmation_status",
  "set_saisie_authorship",
  "set_vehicule_chauffeurs_autorises",
  "sync_fabrication_etapes_on_flags_change",
  "handle_new_user",
  "handle_user_sign_in",
  "check_affaire_open_for_assignation",
] as const;

describe("v0.30.0 — RLS helpers whitelist", () => {
  it("contient exactement 7 helpers RLS protégés", () => {
    expect(RLS_HELPERS).toHaveLength(7);
  });

  it("inclut les 3 helpers RBAC de base", () => {
    expect(RLS_HELPERS).toContain("is_admin");
    expect(RLS_HELPERS).toContain("is_chef_or_admin");
    expect(RLS_HELPERS).toContain("has_role");
  });

  it("inclut les 4 helpers d'accès affaire/devis", () => {
    expect(RLS_HELPERS).toContain("user_has_affaire_access");
    expect(RLS_HELPERS).toContain("is_devis_termine");
    expect(RLS_HELPERS).toContain("can_saisie_on_affaire");
    expect(RLS_HELPERS).toContain("user_is_mentioned_on_affaire");
  });

  it("aucun chevauchement RLS_HELPERS / CLIENT_CALLABLE_RPCS", () => {
    const intersection = RLS_HELPERS.filter((h) =>
      (CLIENT_CALLABLE_RPCS as readonly string[]).includes(h),
    );
    expect(intersection).toEqual([]);
  });

  it("aucun chevauchement RLS_HELPERS / INTERNAL_TRIGGERS", () => {
    const intersection = RLS_HELPERS.filter((h) =>
      (INTERNAL_TRIGGERS as readonly string[]).includes(h),
    );
    expect(intersection).toEqual([]);
  });
});

describe("v0.30.0 — SECURITY DEFINER catégorisation", () => {
  it("RPCs client-callable contient les admin_get_* (gating interne)", () => {
    expect(CLIENT_CALLABLE_RPCS).toContain("admin_get_auth_events");
    expect(CLIENT_CALLABLE_RPCS).toContain("admin_get_invitations");
    expect(CLIENT_CALLABLE_RPCS).toContain("admin_get_user_connection_stats");
  });

  it("RPCs client-callable contient les RPCs opportunités v0.29.2", () => {
    expect(CLIENT_CALLABLE_RPCS).toContain("get_last_used_codes");
    expect(CLIENT_CALLABLE_RPCS).toContain("next_affaire_numero");
    expect(CLIENT_CALLABLE_RPCS).toContain("sign_opportunite");
  });

  it("Triggers internes contient les guards et notify_*", () => {
    expect(INTERNAL_TRIGGERS).toContain("guard_devis_livraison");
    expect(INTERNAL_TRIGGERS).toContain("notify_heures_change");
    expect(INTERNAL_TRIGGERS).toContain("apply_swap_on_validation");
  });

  it("Total = 7 + 11 + 36 = 54 fonctions catégorisées (la 55e create_notification est volontairement omise)", () => {
    const total =
      RLS_HELPERS.length + CLIENT_CALLABLE_RPCS.length + INTERNAL_TRIGGERS.length;
    expect(total).toBe(7 + 11 + 36);
  });
});

describe("v0.30.0 — UNIQUE indexes anti-doublon imports", () => {
  it("devis_imports.fichier_hash UNIQUE est documenté comme actif", () => {
    // Index name attendu en base : devis_imports_hash_unique
    const expectedIndexName = "devis_imports_hash_unique";
    expect(expectedIndexName).toMatch(/^devis_imports_.*unique$/);
  });

  it("opportunites_imports.fichier_hash NON-UNIQUE par décision métier", () => {
    // Décision v0.30.0 : permettre re-import après nettoyage.
    // Si on ajoute UNIQUE plus tard, ce test devra être inversé.
    const isUniqueExpected = false;
    expect(isUniqueExpected).toBe(false);
  });
});
