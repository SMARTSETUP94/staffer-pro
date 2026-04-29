/**
 * Tests de re-soumission après rejet (workflow employé mobile).
 *
 * Scénario : un chef rejette une saisie avec motif → l'employé voit le motif
 * + le bouton "J'ai compris" + le banner rouge → l'employé re-soumet la
 * saisie SANS cliquer "J'ai compris" → le trigger SQL acquitte automatiquement
 * (set_motif_rejet_lu_le) → le bouton et le banner disparaissent MAIS le
 * motif reste affiché pour traçabilité.
 *
 * On vérifie ici tous les états dérivés (banner, bouton inline, badge "à lire",
 * verrou "Soumettre", historique, notifications) avant/après re-soumission.
 */
import { describe, it, expect } from "vitest";
import {
  applyResubmit,
  isAcquittementRequis,
  countAcquittementsRequis,
  actionTypeFor,
  expectedNotificationsFor,
  canTransition,
  type SaisieRejetee,
  type Statut,
} from "@/lib/validation-heures-helpers";

/* ─────────── Modèle UI minimal ─────────── */

interface UiSaisie extends SaisieRejetee {
  id: string;
  date: string;
  motif_rejet: string | null;
  motif_rejet_lu_le: string | null;
}

/** États dérivés de MesHeuresGrid (variant="mobile"). */
function deriveUiState(s: UiSaisie) {
  const motifVisible = s.statut === "rejete" && !!s.motif_rejet;
  const ackButtonVisible = motifVisible && !s.motif_rejet_lu_le;
  const aLireBadge = isAcquittementRequis(s);
  return { motifVisible, ackButtonVisible, aLireBadge };
}

function deriveWeekState(saisies: UiSaisie[]) {
  const aLire = countAcquittementsRequis(saisies);
  return {
    bannerVisible: aLire > 0,
    aLireCount: aLire,
    soumettreDisabled: aLire > 0,
  };
}

const FIXED_NOW = "2026-04-29T09:00:00.000Z";
const rejetee = (overrides: Partial<UiSaisie> = {}): UiSaisie => ({
  id: "saisie-lundi",
  date: "2026-04-27",
  statut: "rejete",
  motif_rejet: "Pause déjeuner non déduite (45 min)",
  motif_rejet_lu_le: null,
  ...overrides,
});

/* ─────────── Tests ─────────── */

describe("Re-soumission après rejet — états dérivés UI", () => {
  it("AVANT re-soumission : motif + bouton ack + badge 'à lire' + banner + soumission verrouillée", () => {
    const s = rejetee();
    const ui = deriveUiState(s);
    expect(ui.motifVisible).toBe(true);
    expect(ui.ackButtonVisible).toBe(true);
    expect(ui.aLireBadge).toBe(true);

    const week = deriveWeekState([s]);
    expect(week.bannerVisible).toBe(true);
    expect(week.aLireCount).toBe(1);
    expect(week.soumettreDisabled).toBe(true);
  });

  it("APRÈS re-soumission directe (sans clic 'J'ai compris') : bouton ack disparaît, motif reste visible", () => {
    const before = rejetee();
    const after = applyResubmit(before) as UiSaisie;
    after.id = before.id;
    after.date = before.date;

    // Le trigger SQL passe statut → 'soumis' et pose motif_rejet_lu_le.
    expect(after.statut).toBe("soumis");
    expect(after.motif_rejet_lu_le).toBeTruthy();
    // CRITIQUE : le motif est conservé pour traçabilité.
    expect(after.motif_rejet).toBe(before.motif_rejet);

    const ui = deriveUiState(after);
    // Bouton ack disparu (statut !== 'rejete').
    expect(ui.ackButtonVisible).toBe(false);
    // Badge 'à lire' éteint.
    expect(ui.aLireBadge).toBe(false);
    // Le bloc motif n'est plus affiché car statut !== 'rejete' — c'est attendu :
    // une saisie "soumis" n'affiche pas de motif courant, l'historique le conserve.
    expect(ui.motifVisible).toBe(false);
  });

  it("APRÈS clic 'J'ai compris' SEUL (sans re-soumettre) : bouton disparaît mais motif reste car statut='rejete'", () => {
    const before = rejetee();
    const acquitté: UiSaisie = { ...before, motif_rejet_lu_le: FIXED_NOW };

    const ui = deriveUiState(acquitté);
    expect(ui.motifVisible).toBe(true); // statut toujours 'rejete'
    expect(ui.ackButtonVisible).toBe(false); // motif_rejet_lu_le rempli
    expect(ui.aLireBadge).toBe(false);

    const week = deriveWeekState([acquitté]);
    expect(week.bannerVisible).toBe(false);
    expect(week.soumettreDisabled).toBe(false); // l'employé peut maintenant re-soumettre
  });

  it("re-soumettre est interdit côté DB sans passer par 'rejete' → 'soumis' (transition autorisée uniquement)", () => {
    expect(canTransition("rejete", "soumis")).toBe(true);
    expect(canTransition("valide", "soumis")).toBe(false);
    expect(canTransition("brouillon", "valide")).toBe(false);
  });

  it("applyResubmit refuse une saisie qui n'est pas au statut 'rejete'", () => {
    expect(() => applyResubmit({ statut: "soumis", motif_rejet: null, motif_rejet_lu_le: null }))
      .toThrow(/rejete/);
    expect(() => applyResubmit({ statut: "valide", motif_rejet: null, motif_rejet_lu_le: null }))
      .toThrow(/rejete/);
  });
});

describe("Re-soumission — invariants historique & notifications", () => {
  it("logue 'acquittement' (et non 'soumission') quand le motif n'avait pas été lu avant la re-soumission", () => {
    const action = actionTypeFor(
      { from: "rejete", to: "soumis" },
      { saisiParChef: false, estResoumissionAvecAcquittement: true },
    );
    expect(action).toBe("acquittement");
  });

  it("logue 'soumission' simple si l'employé avait déjà cliqué 'J'ai compris' avant", () => {
    const action = actionTypeFor(
      { from: "rejete", to: "soumis" },
      { saisiParChef: false, estResoumissionAvecAcquittement: false },
    );
    expect(action).toBe("soumission");
  });

  it("la re-soumission ne déclenche AUCUNE notification employé (pas de saisie_par_chef ni heures_*)", () => {
    const notifs = expectedNotificationsFor(
      { from: "rejete", to: "soumis" },
      { saisieId: "s1", employeProfileId: "p1" },
    );
    expect(notifs).toEqual([]);
  });

  it("après re-soumission, une nouvelle validation chef notifie 'heures_validees' (cycle complet)", () => {
    const notifs = expectedNotificationsFor(
      { from: "soumis", to: "valide" },
      { saisieId: "s1", employeProfileId: "p1" },
    );
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("heures_validees");
  });
});

describe("Re-soumission — cohérence multi-saisies sur la semaine", () => {
  it("re-soumettre 1 rejet sur 2 conserve le banner et le verrou 'Soumettre'", () => {
    const s1 = rejetee({ id: "lundi" });
    const s2 = rejetee({ id: "mardi", motif_rejet: "Heure d'arrivée incorrecte" });

    const before = deriveWeekState([s1, s2]);
    expect(before.aLireCount).toBe(2);
    expect(before.soumettreDisabled).toBe(true);

    const s1Resoumis = { ...(applyResubmit(s1) as UiSaisie), id: "lundi", date: s1.date };
    const after = deriveWeekState([s1Resoumis, s2]);
    expect(after.aLireCount).toBe(1);
    expect(after.bannerVisible).toBe(true);
    expect(after.soumettreDisabled).toBe(true);
  });

  it("re-soumettre TOUS les rejets éteint banner + verrou + tous les boutons inline", () => {
    const list: UiSaisie[] = [
      rejetee({ id: "a" }),
      rejetee({ id: "b", motif_rejet: "Autre motif" }),
    ];
    const after: UiSaisie[] = list.map((s) => ({
      ...(applyResubmit(s) as UiSaisie),
      id: s.id,
      date: s.date,
    }));

    const week = deriveWeekState(after);
    expect(week.aLireCount).toBe(0);
    expect(week.bannerVisible).toBe(false);
    expect(week.soumettreDisabled).toBe(false);
    after.forEach((s) => {
      expect(deriveUiState(s).ackButtonVisible).toBe(false);
    });
  });

  it("re-soumission d'une saisie est idempotente vis-à-vis de motif_rejet_lu_le déjà posé", () => {
    const dejaLu = rejetee({ motif_rejet_lu_le: FIXED_NOW });
    const after = applyResubmit(dejaLu);
    // Ne réécrit pas le timestamp existant (préserve la date d'acquittement réelle).
    expect(after.motif_rejet_lu_le).toBe(FIXED_NOW);
    expect(after.statut).toBe("soumis");
  });
});

describe("Re-soumission — cycle complet rejet → re-soumission → re-rejet", () => {
  it("un second rejet remet le badge 'à lire' à 1 et ré-affiche le bouton ack", () => {
    const s1 = rejetee();
    // Re-soumission auto-acquittée.
    const reSoumis = { ...(applyResubmit(s1) as UiSaisie), id: s1.id, date: s1.date };
    expect(deriveUiState(reSoumis).aLireBadge).toBe(false);

    // Le chef re-rejette avec un nouveau motif → l'API met motif_rejet_lu_le à null.
    const reRejete: UiSaisie = {
      ...reSoumis,
      statut: "rejete" as Statut,
      motif_rejet: "Nouveau motif après 2e contrôle",
      motif_rejet_lu_le: null,
    };

    const ui = deriveUiState(reRejete);
    expect(ui.motifVisible).toBe(true);
    expect(ui.ackButtonVisible).toBe(true);
    expect(ui.aLireBadge).toBe(true);
    expect(deriveWeekState([reRejete]).aLireCount).toBe(1);
  });
});
