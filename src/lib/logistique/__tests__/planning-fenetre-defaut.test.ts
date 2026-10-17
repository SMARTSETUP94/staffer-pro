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

const ROUTE = path.resolve(__dirname, "../../routes/_app.logistique.index.tsx");

describe("planning logistique — fenêtre par défaut", () => {
  const src = fs.readFileSync(ROUTE, "utf8");

  it("démarre à aujourd'hui (pas au lundi de la semaine)", () => {
    expect(src).toMatch(/useState\(\(\) => startOfDay\(new Date\(\)\)\)/);
    expect(src).not.toMatch(/useState\(\(\) => startOfWeek/);
  });

  it("affiche 1 semaine par défaut (7 jours)", () => {
    expect(src).toMatch(/useState<1 \| 2 \| 4>\(1\)/);
  });

  it("le bouton « Aujourd'hui » revient à la date du jour", () => {
    expect(src).toMatch(/setStart\(startOfDay\(new Date\(\)\)\)/);
  });
});
