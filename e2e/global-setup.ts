/**
 * v0.34 — Global setup Playwright.
 *
 * Pour chaque compte test, ouvre une session, login, et persiste le storageState.
 * Les projects Playwright réutilisent ces fichiers → pas de re-login par test.
 */
import { chromium, type FullConfig } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { TEST_ACCOUNTS } from "./fixtures/test-accounts";
import { loginAs } from "./helpers/auth";

export default async function globalSetup(config: FullConfig) {
  await mkdir("e2e/.auth", { recursive: true });
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";

  for (const account of Object.values(TEST_ACCOUNTS)) {
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
      await loginAs(page, account);
      await context.storageState({ path: account.storageStatePath });
      // eslint-disable-next-line no-console
      console.log(`[E2E setup] ✅ storageState ${account.role} → ${account.storageStatePath}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[E2E setup] ❌ login échoué pour ${account.role}:`, err);
      throw err;
    } finally {
      await browser.close();
    }
  }
}
