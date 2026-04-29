/**
 * Tests de re-soumission après rejet — scénarios MULTI-EMPLOYÉS sur la même semaine.
 *
 * Vérifie que les états dérivés (badge "à lire", verrou "Soumettre") sont
 * STRICTEMENT scopés par employé : la re-soumission de l'employé A ne doit
 * jamais débloquer l'UI de l'employé B, et inversement.
 *
 * Contexte : le chef rejette des saisies de plusieurs employés sur la même
 * semaine. Chaque employé voit SA propre vue mobile (mes-heures) avec son
 * propre compteur et son propre verrou.
 */
import { describe, it, expect } from "vitest";
import {
  applyResubmit,
  isAcquittementRequis,
  countAcquittementsRequis,
  type SaisieRejetee,
  type Statut,
} from "@/lib/validation-heures-helpers";

/* ─────────── Modèle multi-employés ─────────── */

interface UiSaisie extends SaisieRejetee {
  id: string;
  employe_id: string;
  date: string;
}

interface EmployeWeekState {
  employe_id: string;
  bannerVisible: boolean;
  aLireCount: number;
  soumettreDisabled: boolean;
  ackButtonsCount: number;
}

/** Reproduit le scoping côté hook useMesHeures(employeId). */
function selectorForEmploye(all: UiSaisie[], employeId: string): UiSaisie[] {
  return all.filter((s) => s.employe_id === employeId);
}

function deriveWeekStatePerEmploye(all: UiSaisie[], employeId: string): EmployeWeekState {
  const mine = selectorForEmploye(all, employeId);
  const aLire = countAcquittementsRequis(mine);
  return {
    employe_id: employeId,
    bannerVisible: aLire > 0,
    aLireCount: aLire,
    soumettreDisabled: aLire > 0,
    ackButtonsCount: mine.filter(isAcquittementRequis).length,
  };
}

/* ─────────── Fixtures multi-employés ─────────── */

const E_ALICE = "emp-alice";
const E_BOB = "emp-bob";
const E_CHARLIE = "emp-charlie";

const mkRejet = (id: string, employe_id: string, date: string, motif = "Pause non déduite"): UiSaisie => ({
  id,
  employe_id,
  date,
  statut: "rejete" as Statut,
  motif_rejet: motif,
  motif_rejet_lu_le: null,
});

const mkValide = (id: string, employe_id: string, date: string): UiSaisie => ({
  id,
  employe_id,
  date,
  statut: "valide" as Statut,
  motif_rejet: null,
  motif_rejet_lu_le: null,
});

/** Re-soumet une saisie en préservant id/employe_id/date (le helper pur ne les connaît pas). */
function resubmit(s: UiSaisie): UiSaisie {
  const after = applyResubmit(s);
  return { ...after, id: s.id, employe_id: s.employe_id, date: s.date };
}

/* ─────────── Tests ─────────── */

describe("Multi-employés — isolation des compteurs sur la même semaine", () => {
  it("le badge 'à lire' est calculé par employé, pas globalement", () => {
    const all: UiSaisie[] = [
      mkRejet("a1", E_ALICE, "2026-04-27"),
      mkRejet("a2", E_ALICE, "2026-04-28"),
      mkRejet("b1", E_BOB, "2026-04-27"),
      mkValide("c1", E_CHARLIE, "2026-04-27"),
    ];

    const alice = deriveWeekStatePerEmploye(all, E_ALICE);
    const bob = deriveWeekStatePerEmploye(all, E_BOB);
    const charlie = deriveWeekStatePerEmploye(all, E_CHARLIE);

    expect(alice.aLireCount).toBe(2);
    expect(bob.aLireCount).toBe(1);
    expect(charlie.aLireCount).toBe(0);

    // La somme des compteurs par employé == compteur global, mais chaque employé
    // ne voit QUE le sien.
    expect(countAcquittementsRequis(all)).toBe(3);
  });

  it("le verrou 'Soumettre' est par employé : Alice bloquée n'empêche pas Bob de soumettre", () => {
    const all: UiSaisie[] = [
      mkRejet("a1", E_ALICE, "2026-04-27"),
      mkValide("b1", E_BOB, "2026-04-27"),
    ];

    expect(deriveWeekStatePerEmploye(all, E_ALICE).soumettreDisabled).toBe(true);
    expect(deriveWeekStatePerEmploye(all, E_BOB).soumettreDisabled).toBe(false);
  });

  it("le banner rouge est par employé : Bob ne voit pas le rejet d'Alice", () => {
    const all: UiSaisie[] = [
      mkRejet("a1", E_ALICE, "2026-04-27"),
      mkValide("b1", E_BOB, "2026-04-27"),
    ];

    expect(deriveWeekStatePerEmploye(all, E_ALICE).bannerVisible).toBe(true);
    expect(deriveWeekStatePerEmploye(all, E_BOB).bannerVisible).toBe(false);
  });
});

describe("Multi-employés — re-soumission n'affecte que l'employé concerné", () => {
  it("Alice re-soumet → SON badge tombe à 0, celui de Bob reste inchangé", () => {
    const a1 = mkRejet("a1", E_ALICE, "2026-04-27");
    const b1 = mkRejet("b1", E_BOB, "2026-04-27");
    const all = [a1, b1];

    expect(deriveWeekStatePerEmploye(all, E_ALICE).aLireCount).toBe(1);
    expect(deriveWeekStatePerEmploye(all, E_BOB).aLireCount).toBe(1);

    // Alice re-soumet sa saisie → trigger SQL acquitte automatiquement.
    const allAfter = all.map((s) => (s.id === "a1" ? resubmit(s) : s));

    const alice = deriveWeekStatePerEmploye(allAfter, E_ALICE);
    const bob = deriveWeekStatePerEmploye(allAfter, E_BOB);

    // Alice : débloquée
    expect(alice.aLireCount).toBe(0);
    expect(alice.bannerVisible).toBe(false);
    expect(alice.soumettreDisabled).toBe(false);
    expect(alice.ackButtonsCount).toBe(0);

    // Bob : strictement inchangé
    expect(bob.aLireCount).toBe(1);
    expect(bob.bannerVisible).toBe(true);
    expect(bob.soumettreDisabled).toBe(true);
    expect(bob.ackButtonsCount).toBe(1);
  });

  it("Alice re-soumet 1 rejet sur 2 → SON badge passe de 2 à 1, son verrou reste actif", () => {
    const all = [
      mkRejet("a1", E_ALICE, "2026-04-27"),
      mkRejet("a2", E_ALICE, "2026-04-28"),
      mkRejet("b1", E_BOB, "2026-04-27"),
    ];

    const allAfter = all.map((s) => (s.id === "a1" ? resubmit(s) : s));

    const alice = deriveWeekStatePerEmploye(allAfter, E_ALICE);
    expect(alice.aLireCount).toBe(1);
    expect(alice.soumettreDisabled).toBe(true); // toujours verrouillée à cause de a2
    expect(alice.bannerVisible).toBe(true);

    const bob = deriveWeekStatePerEmploye(allAfter, E_BOB);
    expect(bob.aLireCount).toBe(1);
    expect(bob.soumettreDisabled).toBe(true);
  });

  it("Bob re-soumet en parallèle d'Alice → leurs états convergent indépendamment", () => {
    const all = [
      mkRejet("a1", E_ALICE, "2026-04-27"),
      mkRejet("b1", E_BOB, "2026-04-27"),
      mkRejet("b2", E_BOB, "2026-04-28"),
    ];

    // Étape 1 : Alice re-soumet a1, Bob re-soumet b1 (en parallèle).
    let allAfter = all.map((s) => (s.id === "a1" || s.id === "b1" ? resubmit(s) : s));

    expect(deriveWeekStatePerEmploye(allAfter, E_ALICE).aLireCount).toBe(0);
    expect(deriveWeekStatePerEmploye(allAfter, E_ALICE).soumettreDisabled).toBe(false);
    expect(deriveWeekStatePerEmploye(allAfter, E_BOB).aLireCount).toBe(1); // b2 reste
    expect(deriveWeekStatePerEmploye(allAfter, E_BOB).soumettreDisabled).toBe(true);

    // Étape 2 : Bob re-soumet b2.
    allAfter = allAfter.map((s) => (s.id === "b2" ? resubmit(s) : s));

    expect(deriveWeekStatePerEmploye(allAfter, E_BOB).aLireCount).toBe(0);
    expect(deriveWeekStatePerEmploye(allAfter, E_BOB).soumettreDisabled).toBe(false);
    // Alice toujours débloquée.
    expect(deriveWeekStatePerEmploye(allAfter, E_ALICE).aLireCount).toBe(0);
  });
});

describe("Multi-employés — invariants de scoping (anti-fuite UI)", () => {
  it("aucune saisie d'un autre employé ne fuit dans le sélecteur per-employé", () => {
    const all = [
      mkRejet("a1", E_ALICE, "2026-04-27"),
      mkRejet("b1", E_BOB, "2026-04-27"),
      mkRejet("c1", E_CHARLIE, "2026-04-27"),
    ];

    for (const eid of [E_ALICE, E_BOB, E_CHARLIE]) {
      const mine = selectorForEmploye(all, eid);
      expect(mine.every((s) => s.employe_id === eid)).toBe(true);
      expect(mine).toHaveLength(1);
    }
  });

  it("re-soumettre la saisie d'Alice ne met JAMAIS à jour motif_rejet_lu_le de Bob", () => {
    const a1 = mkRejet("a1", E_ALICE, "2026-04-27");
    const b1 = mkRejet("b1", E_BOB, "2026-04-27");
    const all = [a1, b1];

    const allAfter = all.map((s) => (s.id === "a1" ? resubmit(s) : s));
    const bobAfter = allAfter.find((s) => s.id === "b1")!;

    // Bob inchangé bit-à-bit sur les champs critiques.
    expect(bobAfter.statut).toBe("rejete");
    expect(bobAfter.motif_rejet_lu_le).toBeNull();
    expect(bobAfter.motif_rejet).toBe(b1.motif_rejet);
  });

  it("la somme des aLireCount par employé == compteur global, avant et après re-soumissions partielles", () => {
    const all = [
      mkRejet("a1", E_ALICE, "2026-04-27"),
      mkRejet("a2", E_ALICE, "2026-04-28"),
      mkRejet("b1", E_BOB, "2026-04-27"),
      mkRejet("c1", E_CHARLIE, "2026-04-29"),
    ];

    const sumByEmploye = (list: UiSaisie[]) =>
      [E_ALICE, E_BOB, E_CHARLIE].reduce(
        (acc, eid) => acc + deriveWeekStatePerEmploye(list, eid).aLireCount,
        0,
      );

    expect(sumByEmploye(all)).toBe(countAcquittementsRequis(all));
    expect(sumByEmploye(all)).toBe(4);

    const allAfter = all.map((s) =>
      s.id === "a1" || s.id === "c1" ? resubmit(s) : s,
    );
    expect(sumByEmploye(allAfter)).toBe(countAcquittementsRequis(allAfter));
    expect(sumByEmploye(allAfter)).toBe(2); // a2 + b1
  });

  it("un employé sans aucun rejet a toujours bannerVisible=false et soumettreDisabled=false", () => {
    const all = [mkRejet("a1", E_ALICE, "2026-04-27"), mkValide("b1", E_BOB, "2026-04-27")];
    const bob = deriveWeekStatePerEmploye(all, E_BOB);
    expect(bob.bannerVisible).toBe(false);
    expect(bob.soumettreDisabled).toBe(false);
    expect(bob.ackButtonsCount).toBe(0);
  });

  it("un employé inconnu (pas de saisie) a un état neutre (0/false/false)", () => {
    const all = [mkRejet("a1", E_ALICE, "2026-04-27")];
    const ghost = deriveWeekStatePerEmploye(all, "emp-ghost");
    expect(ghost.aLireCount).toBe(0);
    expect(ghost.bannerVisible).toBe(false);
    expect(ghost.soumettreDisabled).toBe(false);
  });
});

describe("Multi-employés — convergence finale après re-soumission complète", () => {
  it("quand TOUS les employés ont re-soumis, tous les badges et verrous sont éteints", () => {
    const all = [
      mkRejet("a1", E_ALICE, "2026-04-27"),
      mkRejet("a2", E_ALICE, "2026-04-28"),
      mkRejet("b1", E_BOB, "2026-04-27"),
      mkRejet("c1", E_CHARLIE, "2026-04-29"),
    ];

    const allAfter = all.map(resubmit);

    for (const eid of [E_ALICE, E_BOB, E_CHARLIE]) {
      const st = deriveWeekStatePerEmploye(allAfter, eid);
      expect(st.aLireCount).toBe(0);
      expect(st.bannerVisible).toBe(false);
      expect(st.soumettreDisabled).toBe(false);
      expect(st.ackButtonsCount).toBe(0);
    }
    expect(countAcquittementsRequis(allAfter)).toBe(0);
  });
});
