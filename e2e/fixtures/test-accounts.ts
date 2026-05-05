/**
 * v0.34 — Fixtures comptes test E2E.
 * v0.41.0c (Sprint 3c.1) — split employé desktop / employé mobile.
 *
 * Comptes seedés dans la base preview/staging.
 * Ne JAMAIS pointer vers la prod.
 *
 * Variables d'env attendues (via .env.test ou GitHub Secrets) :
 *   E2E_ADMIN_EMAIL,           E2E_ADMIN_PASSWORD
 *   E2E_CHEF_EMAIL,            E2E_CHEF_PASSWORD
 *   E2E_EMPLOYE_EMAIL,         E2E_EMPLOYE_PASSWORD          (legacy single)
 *   E2E_EMPLOYE_DESKTOP_EMAIL, E2E_EMPLOYE_DESKTOP_PASSWORD  (optionnel — fallback E2E_EMPLOYE_*)
 *   E2E_EMPLOYE_MOBILE_EMAIL,  E2E_EMPLOYE_MOBILE_PASSWORD   (optionnel — fallback E2E_EMPLOYE_*)
 */

export type TestRole =
  | "admin"
  | "chef_chantier"
  | "employe"
  | "employe_desktop"
  | "employe_mobile";

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
};
