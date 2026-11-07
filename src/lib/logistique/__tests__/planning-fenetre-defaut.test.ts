/**
 * Garde-fou : le planning logistique s'ouvre par défaut sur UNE semaine
 * glissante à partir d'aujourd'hui (J → J+6), et non sur deux semaines
 * calées sur le lundi.
 *
 * Si ce test casse : la valeur par défaut de `start` / `semaines` dans
 * `src/routes/_app.logistique.index.tsx` a été modifiée.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROUTE = path.resolve(__dirname, "../../../routes/_app.logistique.index.tsx");

describe("planning logistique — fenêtre par défaut", () => {
  const src = fs.readFileSync(ROUTE, "utf8");

  it("démarre à aujourd'hui (pas au lundi de la semaine)", () => {
    // Semaine courante : la vue Étapes démarre au jour même (J → J+6).
    expect(src).toMatch(/debut === lundiCourant\(\) \? new Intl\.DateTimeFormat\("sv-SE", \{ timeZone: "Europe\/Paris" \}\)\.format\(new Date\(\)\)/);
  });

  it("affiche 1 semaine par défaut (7 jours)", () => {
    expect(src).toMatch(/useState<1 \| 2 \| 4>\(1\)/);
  });

  it("le bouton « Cette semaine » revient à la semaine du jour", () => {
    expect(src).toMatch(/onClick=\{\(\) => setDebut\(lundiCourant\(\)\)\}>Cette semaine/);
  });
});
