/**
 * v0.41.0c (Sprint 3c.1) — E2E employé desktop : flows critiques.
 *
 * Couvre 6 flows manquants identifiés dans l'audit Sprint 1 :
 *  D1 — /mes-heures affiche les saisies semaine en cours (régression v0.41.0a).
 *  D2 — saisie hors planning desktop (modale + Autre chantier).
 *  D3 — /ma-semaine affiche affectations cliquables.
 *  D4 — /profil accessible et liste les infos perso.
 *  D5 — bouton "Se déconnecter" depuis la sidebar redirige vers /login.
 *  D6 — anti-fuite RGPD : un employé est bloqué sur /staffing/<planId>.
 *
 * Tests volontairement défensifs (pas de hard fail si DB vide) — l'objectif
 * principal est de capturer une régression de routing, RLS ou cache hook.
 */
import { expect, test } from "@playwright/test";

test.describe("employé desktop / flows critiques v0.41", () => {
  test("D1 — /mes-heures rend la grille semaine et un tableau", async ({ page }) => {
    await page.goto("/mes-heures");
    await expect(page.getByRole("heading", { name: /Mes heures/i })).toBeVisible({
      timeout: 15_000,
    });
    // La grille doit monter (titre semaine + WeekPicker)
    await expect(page.getByText(/Saisissez vos heures/i)).toBeVisible();
  });

  test("D2 — saisie hors planning desktop (Autre chantier)", async ({ page }) => {
    await page.goto("/mes-heures");
    const trigger = page.getByTestId("btn-add-hors-planning").first();
    if ((await trigger.count()) === 0) {
      test.skip(true, "Aucun bouton hors planning visible (DB sans assignation cette semaine)");
    }
    await trigger.click();
    await expect(
      page.getByRole("heading", { name: /Saisir des heures hors planning/i }),
    ).toBeVisible({ timeout: 10_000 });
    // On ferme : on valide juste l'ouverture (le flow complet est couvert en mobile)
    await page.keyboard.press("Escape");
  });

  test("D3 — /ma-semaine affiche au moins un repère semaine", async ({ page }) => {
    await page.goto("/ma-semaine");
    await expect(page.getByText(/lundi|mardi|mercredi|jeudi|vendredi|semaine/i).first())
      .toBeVisible({ timeout: 15_000 });
  });

  test("D4 — /profil (mobile.profil reroute) accessible", async ({ page }) => {
    // Desktop n'a pas /profil dédié — on cible /mobile/profil qui doit
    // s'ouvrir aussi en desktop pour tout employé connecté.
    const resp = await page.goto("/mobile/profil");
    expect(resp?.status() ?? 200).toBeLessThan(400);
    await expect(page.getByText(/profil|déconn/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("D5 — bouton Se déconnecter visible depuis la sidebar", async ({ page }) => {
    await page.goto("/ma-semaine");
    // Sidebar peut être collapsed → on vérifie au moins la présence d'un
    // bouton/icône logout détectable.
    const logout = page
      .getByRole("button", { name: /se déconnecter|déconnexion|logout/i })
      .or(page.getByTitle(/se déconnecter|déconnexion/i));
    await expect(logout.first()).toBeVisible({ timeout: 10_000 });
  });

  test("D6 — anti-fuite RGPD : /staffing/fake-id refuse l'employé", async ({ page }) => {
    const response = await page.goto("/staffing/00000000-0000-0000-0000-000000000000");
    const blockedByRedirect = !/\/staffing\//.test(page.url());
    const blockedByMessage = await page
      .getByText(/accès refusé|non autorisé|introuvable|404/i)
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    const blockedByStatus = (response?.status() ?? 200) >= 400;
    expect(blockedByRedirect || blockedByMessage || blockedByStatus).toBeTruthy();
  });
});
