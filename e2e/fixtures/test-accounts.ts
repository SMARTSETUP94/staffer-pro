/**
 * v0.34 — Fixtures comptes test E2E.
 * v0.41.0c (Sprint 3c.1) — split employé desktop / employé mobile.
 * Lot 8.2b — ajout commercial / bureau_etude / atelier_chef pour matrice Fiche Objet.
 *
 * Comptes seedés dans la base preview/staging via `bun run e2e/seed.ts`.
 * Ne JAMAIS pointer vers la prod.
 *
 * Variables d'env attendues (via .env.test ou GitHub Secrets) :
 *   E2E_ADMIN_EMAIL,           E2E_ADMIN_PASSWORD
 *   E2E_CHEF_EMAIL,            E2E_CHEF_PASSWORD
 *   E2E_EMPLOYE_EMAIL,         E2E_EMPLOYE_PASSWORD          (legacy single)
 *   E2E_EMPLOYE_DESKTOP_EMAIL, E2E_EMPLOYE_DESKTOP_PASSWORD  (optionnel — fallback E2E_EMPLOYE_*)
 *   E2E_EMPLOYE_MOBILE_EMAIL,  E2E_EMPLOYE_MOBILE_PASSWORD   (optionnel — fallback E2E_EMPLOYE_*)
 *   E2E_COMMERCIAL_EMAIL,      E2E_COMMERCIAL_PASSWORD       (optionnel — défaut test_commercial@setupparis.test)
 *   E2E_BUREAU_ETUDE_EMAIL,    E2E_BUREAU_ETUDE_PASSWORD     (optionnel — défaut test_bureau_etude@setupparis.test)
 *   E2E_ATELIER_CHEF_EMAIL,    E2E_ATELIER_CHEF_PASSWORD     (optionnel — défaut test_atelier_chef@setupparis.test)
 */

export type TestRole =
  | "admin"
  | "chef_chantier"
  | "chef_metier_scoped"
  | "employe"
  | "employe_desktop"
  | "employe_mobile"
  | "commercial"
  | "bureau_etude"
  | "atelier_chef";

export interface TestAccount {
  role: TestRole;
  email: string;
  password: string;
  storageStatePath: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[E2E] Variable d'env manquante: ${name}. Cf docs/e2e-playwright-setup.md`,
    );
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const employeEmail = required("E2E_EMPLOYE_EMAIL");
const employePass = required("E2E_EMPLOYE_PASSWORD");

export const TEST_ACCOUNTS: Record<TestRole, TestAccount> = {
  admin: {
    role: "admin",
    email: required("E2E_ADMIN_EMAIL"),
    password: required("E2E_ADMIN_PASSWORD"),
    storageStatePath: "e2e/.auth/admin.json",
  },
  chef_chantier: {
    role: "chef_chantier",
    email: required("E2E_CHEF_EMAIL"),
    password: required("E2E_CHEF_PASSWORD"),
    storageStatePath: "e2e/.auth/chef.json",
  },
  // v0.44.4 — Chef scopé par métier (sous-rôle de chef_chantier avec filtre métier).
  chef_metier_scoped: {
    role: "chef_metier_scoped",
    email: optional("E2E_CHEF_SCOPED_EMAIL", "e2e-chef-scoped@staffer.test"),
    password: optional("E2E_CHEF_SCOPED_PASSWORD", "Chef-Scoped-E2E-2026!"),
    storageStatePath: "e2e/.auth/chef-scoped.json",
  },
  employe: {
    role: "employe",
    email: employeEmail,
    password: employePass,
    storageStatePath: "e2e/.auth/employe.json",
  },
  employe_desktop: {
    role: "employe_desktop",
    email: optional("E2E_EMPLOYE_DESKTOP_EMAIL", employeEmail),
    password: optional("E2E_EMPLOYE_DESKTOP_PASSWORD", employePass),
    storageStatePath: "e2e/.auth/employe-desktop.json",
  },
  employe_mobile: {
    role: "employe_mobile",
    email: optional("E2E_EMPLOYE_MOBILE_EMAIL", employeEmail),
    password: optional("E2E_EMPLOYE_MOBILE_PASSWORD", employePass),
    storageStatePath: "e2e/.auth/employe-mobile.json",
  },
  // Lot 8.2b — Comptes test pour matrice Fiche Objet.
  commercial: {
    role: "commercial",
    email: optional("E2E_COMMERCIAL_EMAIL", "test_commercial@setupparis.test"),
    password: optional("E2E_COMMERCIAL_PASSWORD", "Commercial-E2E-2026!"),
    storageStatePath: "e2e/.auth/commercial.json",
  },
  bureau_etude: {
    role: "bureau_etude",
    email: optional("E2E_BUREAU_ETUDE_EMAIL", "test_bureau_etude@setupparis.test"),
    password: optional("E2E_BUREAU_ETUDE_PASSWORD", "BureauEtude-E2E-2026!"),
    storageStatePath: "e2e/.auth/bureau-etude.json",
  },
  atelier_chef: {
    role: "atelier_chef",
    email: optional("E2E_ATELIER_CHEF_EMAIL", "test_atelier_chef@setupparis.test"),
    password: optional("E2E_ATELIER_CHEF_PASSWORD", "AtelierChef-E2E-2026!"),
    storageStatePath: "e2e/.auth/atelier-chef.json",
  },
};
