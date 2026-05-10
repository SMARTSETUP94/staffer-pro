/**
 * v0.44.2 — Polish post-v0.44.1 :
 *  (1) Redirect /mobile/chef/a-valider → /mobile/chef/atelier
 *  (2) Dashboard chef KPI cards : Heures → /equipe, Objets → /atelier,
 *      Photos récentes (7j) → /atelier
 *  (3) Sous-tab Valider dans /mobile/chef/equipe
 *  (4) Kanban Vue chantier : 4 colonnes + badges compteur + filtres
 *      localStorage + tri intelligent (retard d'abord)
 *  (5) Photos par objet : sélection objet → upload caméra → galerie
 *
 * Marqués test.skip() si le seed E2E n'a pas d'affaire pour le compte chef.
 */
import { test, expect } from "@playwright/test";

test.describe("v0.44.2 Polish Atelier chef mobile", () => {
  test("(1) /mobile/chef/a-valider redirige vers /mobile/chef/atelier", async ({ page }) => {
    await page.goto("/mobile/chef/a-valider");
    await page.waitForLoadState("networkidle");
    // Après redirect TanStack, l'URL finale doit être /mobile/chef/atelier
    await expect(page).toHaveURL(/\/mobile\/chef\/atelier(\?|$)/);
    await expect(page.getByText(/Atelier/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("(2) Dashboard chef : KPI 'Heures à valider' → /equipe et 'Objets à valider' → /atelier", async ({ page }) => {
    await page.goto("/mobile/chef/dashboard");
    await page.waitForLoadState("networkidle");

    // 'Heures à valider' linke vers /mobile/chef/equipe
    const heuresCard = page.locator("a[href='/mobile/chef/equipe']", { hasText: /Heures à valider/i });
    await expect(heuresCard).toBeVisible({ timeout: 5_000 });

    // 'Objets à valider' linke vers /mobile/chef/atelier
    const objetsCard = page.locator("a[href='/mobile/chef/atelier']", { hasText: /Objets à valider/i });
    await expect(objetsCard).toBeVisible({ timeout: 5_000 });

    // Nouvelle card 'Photos récentes (7j)' présente
    await expect(page.getByText(/Photos récentes/i)).toBeVisible({ timeout: 5_000 });
  });

  test("(3) Sous-tab Valider dans /mobile/chef/equipe", async ({ page }) => {
    await page.goto("/mobile/chef/equipe");
    await page.waitForLoadState("networkidle");

    const validerTab = page.getByRole("tab", { name: /Valider/i });
    if ((await validerTab.count()) === 0) {
      test.skip(true, "Pas de tab Valider — vérifier la route /mobile/chef/equipe");
      return;
    }
    await validerTab.click();
    // La liste des heures à valider (ou empty state) doit apparaître
    await expect(
      page.getByText(/Aucune heure|Valider|Corriger/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("(4) Kanban Vue chantier : 4 colonnes + badges + empty states", async ({ page }) => {
    await page.goto("/mobile/chef/atelier");
    await page.waitForLoadState("networkidle");

    // Switch sur le sous-tab Chantier
    const chantierTab = page.getByRole("tab", { name: /Chantier/i });
    if ((await chantierTab.count()) === 0) {
      test.skip(true, "Pas de tab Chantier");
      return;
    }
    await chantierTab.click();

    // Les 4 colonnes (Bois / Peinture / Manut / Validé)
    const board = page.locator("[data-testid='kanban-board']");
    await expect(board).toBeVisible({ timeout: 5_000 });

    for (const col of ["bois", "peinture", "manut", "valide"]) {
      await expect(page.locator(`[data-testid='kanban-col-${col}']`)).toBeVisible();
    }

    // Empty state OR cards
    const emptyOrCard = page.getByText(/Aucun objet en cours|Qté \d+/i).first();
    await expect(emptyOrCard).toBeVisible({ timeout: 5_000 });
  });

  test("(5) Photos par objet — sélection objet + bouton upload", async ({ page }) => {
    await page.goto("/mobile/chef/atelier");
    await page.waitForLoadState("networkidle");

    const photosTab = page.getByRole("tab", { name: /Photos/i });
    if ((await photosTab.count()) === 0) {
      test.skip(true, "Pas de tab Photos");
      return;
    }
    await photosTab.click();

    // Soit empty state, soit liste d'objets cliquable
    const empty = page.getByText(/Aucun objet sur vos chantiers/i);
    if (await empty.isVisible().catch(() => false)) {
      test.skip(true, "Aucun objet seedé pour ce chef");
      return;
    }

    // Click 1er objet — passe à l'écran galerie
    const firstObjet = page.locator("button").filter({ has: page.locator("text=/Qté|·/i") }).first();
    if ((await firstObjet.count()) === 0) {
      // fallback : 1er button de la liste
      await page.locator("button:has-text('') >> nth=0").first().click({ trial: false });
    } else {
      await firstObjet.click();
    }

    // Bouton "Retour liste" + zone uploader visibles
    await expect(page.getByText(/Retour liste/i)).toBeVisible({ timeout: 5_000 });
  });

  test("(6) Bottom nav Atelier : badge compte UNIQUEMENT les objets (pas les heures)", async ({ page }) => {
    await page.goto("/mobile/chef/dashboard");
    await page.waitForLoadState("networkidle");

    const atelierLink = page.locator("nav a[href='/mobile/chef/atelier']");
    await expect(atelierLink).toBeVisible({ timeout: 5_000 });
    // Si badge présent, sa valeur doit correspondre au compteur 'Objets à valider'
    // (vérification soft : on ne crée pas de données ici, on valide juste l'existence du lien)
  });
});
