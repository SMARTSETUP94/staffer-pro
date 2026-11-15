import { describe, expect, it } from "vitest";
import { paginer, paginerHauteurFixe } from "../planning-equipes-pagination";

/** Blocs empilés depuis les hauteurs données : {top, height}. */
const blocs = (hauteurs: number[]) => {
  let y = 0;
  return hauteurs.map(h => { const b = { top: y, height: h }; y += h; return b; });
};

describe("paginer — export PDF du planning des équipes", () => {
  it("recopie la bande de tête et garde chaque ligne entière", () => {
    const { entete, pages } = paginer(blocs([40, 100, 100, 100]), 260);
    expect(entete).toEqual({ top: 0, height: 40 });
    expect(pages).toEqual([{ start: 40, end: 240 }, { start: 240, end: 340 }]);
  });

  it("ne reprend jamais la bande de tête dans le corps d'une page", () => {
    const { entete, pages } = paginer(blocs([40, 100, 100, 100]), 260);
    for (const p of pages) expect(p.start).toBeGreaterThanOrEqual(entete.height);
  });

  it("une seule page quand tout tient", () => {
    const { pages } = paginer(blocs([40, 100, 60]), 260);
    expect(pages).toEqual([{ start: 40, end: 200 }]);
  });

  it("découpe une ligne plus haute qu'une page", () => {
    const { pages } = paginer(blocs([40, 500]), 260);
    expect(pages).toEqual([{ start: 40, end: 260 }, { start: 260, end: 480 }, { start: 480, end: 540 }]);
  });

  it("sans ligne, ne demande aucune bande de corps", () => {
    const { pages } = paginer(blocs([40]), 260);
    expect(pages).toEqual([{ start: 40, end: 40 }]);
  });
});

describe("paginerHauteurFixe", () => {
  it("couvre tout le contenu sans dépasser la fin", () => {
    expect(paginerHauteurFixe(300, 100)).toEqual([{ start: 0, end: 100 }, { start: 100, end: 200 }, { start: 200, end: 300 }]);
    expect(paginerHauteurFixe(250, 100)).toEqual([{ start: 0, end: 100 }, { start: 100, end: 200 }, { start: 200, end: 250 }]);
  });
});
