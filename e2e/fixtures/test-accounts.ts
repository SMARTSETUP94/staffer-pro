/**
 * v0.34 — Fixtures comptes test E2E.
 *
 * Comptes seedés dans la base preview/staging.
 * Ne JAMAIS pointer vers la prod.
 *
 * Variables d'env attendues (via .env.test ou GitHub Secrets) :
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 *   E2E_CHEF_EMAIL,  E2E_CHEF_PASSWORD
 *   E2E_EMPLOYE_EMAIL, E2E_EMPLOYE_PASSWORD
 */

export interface TestAccount {
  role: "admin" | "chef_chantier" | "employe";
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

export const TEST_ACCOUNTS: Record<TestAccount["role"], TestAccount> = {
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
    email: required("E2E_EMPLOYE_EMAIL"),
    password: required("E2E_EMPLOYE_PASSWORD"),
    storageStatePath: "e2e/.auth/employe.json",
  },
};
