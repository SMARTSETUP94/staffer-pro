/**
 * Lot 8.2 — Fiche Objet : matrice commercial (LECTURE SEULE sur la fab).
 *
 * STUB — nécessite un compte test commercial seedé.
 * Décision PO : commercial peut éditer UNIQUEMENT `commentaire` ; tous les
 * autres champs (nom/quantité/heures/respo_fab) doivent être en disabled.
 *
 * TODO(8.2.x) : seeder `E2E_COMMERCIAL_EMAIL` + `E2E_COMMERCIAL_PASSWORD`
 * + storageState dans `playwright.config.ts > projects` puis activer.
 */
import { test } from "@playwright/test";

test.describe.skip("fiche-objet :: commercial (lecture seule sauf commentaire)", () => {
  test("respo_fab disabled, heures disabled, commentaire éditable", async () => {
    // À implémenter quand le compte test commercial sera seedé.
  });
});
