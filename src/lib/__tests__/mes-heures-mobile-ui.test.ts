/**
 * Tests d'interface employé (mobile) — workflow d'acquittement de rejet.
 *
 * Vérifie le contrat UI rendu par MesHeuresGrid (variant="mobile") sur :
 *   1. Bandeau "X saisie(s) rejetée(s) — action requise" + badge "à lire"
 *   2. Affichage du motif de rejet sous chaque ligne rejetée
 *   3. Bouton "J'ai pris connaissance" / "J'ai compris" (acquittement)
 *   4. Verrouillage du bouton "Soumettre la semaine" tant qu'un rejet
 *      n'a pas été acquitté (hasBlockingRejet)
 *
 * On ne monte pas React : on teste les sélecteurs purs qui pilotent
 * directement les conditions d'affichage du JSX.
 */
import { describe, it, expect } from "vitest";
import {
  isAcquittementRequis,
  countAcquittementsRequis,
  applyResubmit,
  type SaisieRejetee,
} from "@/lib/validation-heures-helpers";

/* ─────────── Modèle minimal ─────────── */

interface UiSaisie extends SaisieRejetee {
  id: string;
  date: string;
  motif_rejet: string | null;
  motif_rejet_lu_le: string | null;
}

/** Reproduit `rejectedNotAcked` du hook useMesHeures. */
function selectRejectedNotAcked(saisies: UiSaisie[]): UiSaisie[] {
  return saisies.filter(isAcquittementRequis);
}

/** Reproduit `hasBlockingRejet` qui désactive le bouton "Soumettre". */
function hasBlockingRejet(saisies: UiSaisie[]): boolean {
  return saisies.some(isAcquittementRequis);
}

/** Doit-on afficher le bloc "Motif rejet" sous une ligne ? */
function shouldRenderMotifBlock(s: UiSaisie | null): boolean {
  return !!s && s.statut === "rejete" && !!s.motif_rejet;
}

/** Doit-on afficher le bouton "J'ai compris" inline (rejet non acquitté) ? */
function shouldRenderInlineAckButton(s: UiSaisie | null): boolean {
  return shouldRenderMotifBlock(s) && !s!.motif_rejet_lu_le;
}

/** Doit-on afficher le banner global rouge "X saisie(s) rejetée(s)" ? */
function shouldRenderTopBanner(saisies: UiSaisie[]): boolean {
  return selectRejectedNotAcked(saisies).length > 0;
}

/* ─────────── Fixtures ─────────── */

const rejeteNonLu = (overrides: Partial<UiSaisie> = {}): UiSaisie => ({
  id: "s-1",
  date: "2026-04-27",
  statut: "rejete",
  motif_rejet: "Heures incohérentes avec le pointage",
  motif_rejet_lu_le: null,
  ...overrides,
});

const rejeteLu = (overrides: Partial<UiSaisie> = {}): UiSaisie => ({
  id: "s-2",
  date: "2026-04-28",
  statut: "rejete",
  motif_rejet: "Pause non déduite",
  motif_rejet_lu_le: "2026-04-29T10:00:00.000Z",
  ...overrides,
});

const valide = (overrides: Partial<UiSaisie> = {}): UiSaisie => ({
  id: "s-3",
  date: "2026-04-29",
  statut: "valide",
  motif_rejet: null,
  motif_rejet_lu_le: null,
  ...overrides,
});

const soumis = (overrides: Partial<UiSaisie> = {}): UiSaisie => ({
  id: "s-4",
  date: "2026-04-30",
  statut: "soumis",
  motif_rejet: null,
  motif_rejet_lu_le: null,
  ...overrides,
});

/* ─────────── Tests ─────────── */

describe("Mobile UI — bandeau global de rejets non lus", () => {
  it("ne s'affiche pas quand aucune saisie n'est rejetée", () => {
    expect(shouldRenderTopBanner([valide(), soumis()])).toBe(false);
  });

  it("s'affiche dès qu'une saisie est rejetée et non acquittée", () => {
    expect(shouldRenderTopBanner([valide(), rejeteNonLu()])).toBe(true);
  });

  it("ne s'affiche pas si tous les rejets ont déjà été acquittés", () => {
    expect(shouldRenderTopBanner([rejeteLu(), valide()])).toBe(false);
  });

  it("compte uniquement les rejets non acquittés (badge 'X à lire')", () => {
    const list = [
      rejeteNonLu({ id: "a" }),
      rejeteNonLu({ id: "b" }),
      rejeteLu({ id: "c" }),
      valide({ id: "d" }),
    ];
    expect(countAcquittementsRequis(list)).toBe(2);
    expect(selectRejectedNotAcked(list).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("ignore un rejet sans motif (cas dégénéré DB) — pas de spam UI", () => {
    const sansMotif = rejeteNonLu({ motif_rejet: null });
    expect(shouldRenderTopBanner([sansMotif])).toBe(false);
    expect(countAcquittementsRequis([sansMotif])).toBe(0);
  });
});

describe("Mobile UI — bloc 'Motif rejet' inline sous chaque ligne", () => {
  it("affiche le motif pour une saisie rejetée non acquittée", () => {
    const s = rejeteNonLu();
    expect(shouldRenderMotifBlock(s)).toBe(true);
  });

  it("affiche le motif même APRÈS acquittement (l'employé doit pouvoir le relire)", () => {
    const s = rejeteLu();
    expect(shouldRenderMotifBlock(s)).toBe(true);
    // mais le bouton inline disparaît
    expect(shouldRenderInlineAckButton(s)).toBe(false);
  });

  it("ne s'affiche jamais sur une saisie non rejetée", () => {
    expect(shouldRenderMotifBlock(valide())).toBe(false);
    expect(shouldRenderMotifBlock(soumis())).toBe(false);
    expect(shouldRenderMotifBlock(null)).toBe(false);
  });
});

describe("Mobile UI — bouton 'J'ai pris connaissance' / 'J'ai compris'", () => {
  it("apparaît uniquement quand statut='rejete' && motif && !motif_rejet_lu_le", () => {
    expect(shouldRenderInlineAckButton(rejeteNonLu())).toBe(true);
  });

  it("disparaît dès que motif_rejet_lu_le est rempli", () => {
    expect(shouldRenderInlineAckButton(rejeteLu())).toBe(false);
  });

  it("n'apparaît pas si la saisie a été re-soumise (acquittement auto)", () => {
    const aprèsResoumission = applyResubmit(rejeteNonLu());
    // Après applyResubmit, statut → 'soumis' et motif_rejet_lu_le est posé.
    expect(aprèsResoumission.statut).toBe("soumis");
    expect(aprèsResoumission.motif_rejet_lu_le).toBeTruthy();
    // Casté pour exécuter les sélecteurs UI :
    const ui: UiSaisie = {
      id: "s-x",
      date: "2026-04-27",
      ...aprèsResoumission,
    };
    expect(shouldRenderInlineAckButton(ui)).toBe(false);
    expect(shouldRenderTopBanner([ui])).toBe(false);
  });
});

describe("Mobile UI — bouton 'Soumettre la semaine' bloqué tant qu'un rejet n'est pas acquitté", () => {
  it("hasBlockingRejet=true tant qu'au moins un rejet est non lu", () => {
    expect(hasBlockingRejet([valide(), rejeteNonLu()])).toBe(true);
  });

  it("hasBlockingRejet=false dès que tous les rejets sont acquittés", () => {
    expect(hasBlockingRejet([valide(), rejeteLu()])).toBe(false);
  });

  it("hasBlockingRejet=false sur une semaine sans aucun rejet", () => {
    expect(hasBlockingRejet([soumis(), valide()])).toBe(false);
  });

  it("acquitter un rejet débloque le bouton (transition lue=now)", () => {
    const before: UiSaisie[] = [rejeteNonLu()];
    expect(hasBlockingRejet(before)).toBe(true);
    const after: UiSaisie[] = before.map((s) =>
      s.id === "s-1" ? { ...s, motif_rejet_lu_le: new Date().toISOString() } : s,
    );
    expect(hasBlockingRejet(after)).toBe(false);
    expect(shouldRenderTopBanner(after)).toBe(false);
    // Le motif reste visible pour traçabilité
    expect(shouldRenderMotifBlock(after[0])).toBe(true);
  });
});

describe("Mobile UI — invariants combinés (cohérence inter-blocs)", () => {
  it("banner et bouton inline s'allument et s'éteignent ensemble pour une même saisie", () => {
    const s = rejeteNonLu();
    expect(shouldRenderTopBanner([s])).toBe(true);
    expect(shouldRenderInlineAckButton(s)).toBe(true);

    const acquitté: UiSaisie = { ...s, motif_rejet_lu_le: "2026-04-29T11:00:00Z" };
    expect(shouldRenderTopBanner([acquitté])).toBe(false);
    expect(shouldRenderInlineAckButton(acquitté)).toBe(false);
  });

  it("compteur du banner == nombre de boutons 'J'ai compris' visibles", () => {
    const list = [rejeteNonLu({ id: "a" }), rejeteNonLu({ id: "b" }), rejeteLu({ id: "c" })];
    const banner = countAcquittementsRequis(list);
    const inlineButtons = list.filter(shouldRenderInlineAckButton).length;
    expect(banner).toBe(inlineButtons);
    expect(banner).toBe(2);
  });
});
