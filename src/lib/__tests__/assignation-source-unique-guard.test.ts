/**
 * Garde-fou : interdit tout INSERT/UPDATE direct sur `assignations` en dehors
 * de la source unique `src/lib/assignation-upsert.ts`.
 *
 * Les suppressions (`.delete()`) restent autorisées partout (aucune donnée
 * d'audit à poser côté DELETE).
 *
 * Si ce test casse : refactor la surface fautive vers `insertAssignation`
 * / `insertAssignationsBatch` / `updateAssignation` / `updateAssignationsByIds`.
 */
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";

const ALLOWED = new Set<string>([
  "src/lib/assignation-upsert.ts",
  // Server-fn (auto-staffing publish) : tourne côté serveur avec son propre
  // `created_by = context.userId` injecté manuellement, hors périmètre client.
  "src/server/staffing-publish.functions.ts",
  // Reset/rattachement de `devis_id` en cascade (pas une création/édition de
  // staffing — juste un nettoyage / rattachement FK a posteriori).
  "src/routes/_app.devis.index.tsx",
  "src/routes/_app.devis.rattachement-historique.tsx",
  // Action métier employé : confirmer / refuser une proposition de mission
  // (statut_confirmation + motif_refus). Pas une saisie de staffing.
  "src/components/propositions/PropositionsList.tsx",
]);

describe("assignations — source unique", () => {
  it("aucun .insert/.update direct sur assignations hors du helper", () => {
    let output = "";
    try {
      output = execSync(
        `rg -l "from\\([\\\"']assignations[\\\"']\\)" src -g '*.ts' -g '*.tsx' -g '!**/__tests__/**' -g '!**/*.test.ts' -g '!**/*.test.tsx' || true`,
        { encoding: "utf8" },
      );
    } catch {
      /* rg renvoie 1 quand aucun match */
    }
    const files = output.split("\n").map((s) => s.trim()).filter(Boolean);
    const offenders = files.filter((f) => {
      if (ALLOWED.has(f)) return false;
      const src = fs.readFileSync(f, "utf8");
      const matches = src.match(
        /from\(["']assignations["']\)[\s\S]{0,200}?\.(insert|update)\(/g,
      );
      return matches && matches.length > 0;
    });
    expect(
      offenders,
      `Surfaces utilisant un INSERT/UPDATE direct sur assignations (router via src/lib/assignation-upsert.ts) :\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
