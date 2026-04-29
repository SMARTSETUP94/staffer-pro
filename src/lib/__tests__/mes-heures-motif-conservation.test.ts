/**
 * Tests : conservation du motif de rejet à travers les transitions.
 *
 * Règle métier : le motif d'un rejet doit rester accessible en lecture
 * même APRÈS re-soumission (statut → 'soumis') et après re-rejet, pour que
 * l'employé et le chef puissent retracer la conversation.
 *
 * - Affichage UI courant (MesHeuresGrid) : on ne montre le bloc motif que
 *   quand statut === 'rejete' (motif "actif"). Sinon on s'appuie sur
 *   l'historique dérivé.
 * - Historique dérivé (timeline) : doit TOUJOURS contenir le ou les motifs
 *   passés, dans l'ordre chronologique, même si l'état courant est 'soumis'
 *   ou 'valide'.
 */
import { describe, it, expect } from "vitest";
import {
  applyResubmit,
  type SaisieRejetee,
  type Statut,
} from "@/lib/validation-heures-helpers";

/* ─────────── Modèle ─────────── */

interface SaisieState extends SaisieRejetee {
  id: string;
}

type EvenementType = "soumission" | "rejet" | "acquittement_auto" | "validation";

interface HistoryEvent {
  type: EvenementType;
  at: string;
  /** Motif posé lors de l'événement (uniquement pour 'rejet'). */
  motif?: string;
  /** Snapshot du motif "courant" au moment de l'événement (traçabilité). */
  motif_snapshot: string | null;
  statut_apres: Statut;
}

/** Motifs dérivés de l'historique = liste ordonnée des motifs de rejet successifs. */
function derivedMotifs(history: HistoryEvent[]): string[] {
  return history.filter((h) => h.type === "rejet" && h.motif).map((h) => h.motif as string);
}

/** Le motif est-il visible inline dans la vue courante (sous la ligne) ? */
function shouldRenderInlineMotif(s: SaisieState): boolean {
  return s.statut === "rejete" && !!s.motif_rejet;
}

/* ─────────── Réducteur de cycle ─────────── */

const T0 = new Date("2026-04-27T08:00:00.000Z").getTime();
const at = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();

function reduce(
  state: SaisieState,
  history: HistoryEvent[],
  action:
    | { kind: "soumettre" }
    | { kind: "rejeter"; motif: string; offsetMin: number }
    | { kind: "resoumettre"; offsetMin: number }
    | { kind: "valider"; offsetMin: number },
): { state: SaisieState; history: HistoryEvent[] } {
  switch (action.kind) {
    case "soumettre": {
      const next: SaisieState = { ...state, statut: "soumis" };
      return {
        state: next,
        history: [
          ...history,
          { type: "soumission", at: at(0), motif_snapshot: state.motif_rejet, statut_apres: "soumis" },
        ],
      };
    }
    case "rejeter": {
      const next: SaisieState = {
        ...state,
        statut: "rejete",
        motif_rejet: action.motif,
        motif_rejet_lu_le: null,
      };
      return {
        state: next,
        history: [
          ...history,
          {
            type: "rejet",
            at: at(action.offsetMin),
            motif: action.motif,
            motif_snapshot: action.motif,
            statut_apres: "rejete",
          },
        ],
      };
    }
    case "resoumettre": {
      const after = applyResubmit(state);
      const next: SaisieState = {
        ...state,
        statut: after.statut,
        motif_rejet: after.motif_rejet,
        motif_rejet_lu_le: after.motif_rejet_lu_le,
      };
      return {
        state: next,
        history: [
          ...history,
          {
            type: "acquittement_auto",
            at: at(action.offsetMin),
            motif_snapshot: next.motif_rejet, // motif conservé !
            statut_apres: "soumis",
          },
        ],
      };
    }
    case "valider": {
      const next: SaisieState = { ...state, statut: "valide" };
      return {
        state: next,
        history: [
          ...history,
          {
            type: "validation",
            at: at(action.offsetMin),
            motif_snapshot: state.motif_rejet, // motif conservé !
            statut_apres: "valide",
          },
        ],
      };
    }
  }
}

const initial = (): SaisieState => ({
  id: "s-conservation",
  statut: "brouillon",
  motif_rejet: null,
  motif_rejet_lu_le: null,
});

/* ─────────── Tests ─────────── */

describe("Conservation du motif — état courant après re-soumission", () => {
  it("le motif reste posé sur la saisie après applyResubmit (statut='soumis')", () => {
    const rejete: SaisieState = {
      id: "x",
      statut: "rejete",
      motif_rejet: "Pause non déduite (45 min)",
      motif_rejet_lu_le: null,
    };
    const after = applyResubmit(rejete);
    expect(after.statut).toBe("soumis");
    expect(after.motif_rejet).toBe("Pause non déduite (45 min)");
    expect(after.motif_rejet_lu_le).toBeTruthy();
  });

  it("le bloc motif inline n'est PAS affiché en statut 'soumis' (UI courante)", () => {
    const rejete: SaisieState = {
      id: "x",
      statut: "rejete",
      motif_rejet: "Motif A",
      motif_rejet_lu_le: null,
    };
    expect(shouldRenderInlineMotif(rejete)).toBe(true);

    const soumisAprèsResoumission: SaisieState = {
      ...rejete,
      ...applyResubmit(rejete),
    };
    // Statut !== 'rejete' → pas de bloc inline, mais le champ motif reste en DB.
    expect(shouldRenderInlineMotif(soumisAprèsResoumission)).toBe(false);
    expect(soumisAprèsResoumission.motif_rejet).toBe("Motif A");
  });

  it("le bloc motif inline réapparaît si la saisie est re-rejetée", () => {
    let { state, history } = { state: initial(), history: [] as HistoryEvent[] };
    ({ state, history } = reduce(state, history, { kind: "soumettre" }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Motif A", offsetMin: 60 }));
    expect(shouldRenderInlineMotif(state)).toBe(true);

    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 120 }));
    expect(shouldRenderInlineMotif(state)).toBe(false);

    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Motif B", offsetMin: 180 }));
    expect(shouldRenderInlineMotif(state)).toBe(true);
    // Le motif visible est le DERNIER (plus récent).
    expect(state.motif_rejet).toBe("Motif B");
  });
});

describe("Conservation du motif — historique dérivé (timeline)", () => {
  it("conserve un motif unique après une re-soumission qui passe par 'soumis'", () => {
    let { state, history } = { state: initial(), history: [] as HistoryEvent[] };
    ({ state, history } = reduce(state, history, { kind: "soumettre" }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Pause non déduite", offsetMin: 60 }));
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 120 }));

    expect(state.statut).toBe("soumis");
    // Motif courant conservé en DB
    expect(state.motif_rejet).toBe("Pause non déduite");
    // Motif présent dans la timeline
    expect(derivedMotifs(history)).toEqual(["Pause non déduite"]);
    // Snapshot motif conservé sur l'événement d'acquittement (traçabilité forte)
    const ack = history.find((h) => h.type === "acquittement_auto")!;
    expect(ack.motif_snapshot).toBe("Pause non déduite");
  });

  it("conserve les DEUX motifs après rejet → re-soumission → re-rejet → re-soumission", () => {
    let { state, history } = { state: initial(), history: [] as HistoryEvent[] };
    ({ state, history } = reduce(state, history, { kind: "soumettre" }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Motif A", offsetMin: 60 }));
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 120 }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Motif B", offsetMin: 180 }));
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 240 }));

    expect(state.statut).toBe("soumis");
    expect(state.motif_rejet).toBe("Motif B");
    expect(derivedMotifs(history)).toEqual(["Motif A", "Motif B"]);
  });

  it("conserve les motifs même après VALIDATION finale (audit post-mortem)", () => {
    let { state, history } = { state: initial(), history: [] as HistoryEvent[] };
    ({ state, history } = reduce(state, history, { kind: "soumettre" }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Motif A", offsetMin: 60 }));
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 120 }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Motif B", offsetMin: 180 }));
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 240 }));
    ({ state, history } = reduce(state, history, { kind: "valider", offsetMin: 300 }));

    expect(state.statut).toBe("valide");
    expect(state.motif_rejet).toBe("Motif B"); // dernier motif conservé en DB
    expect(derivedMotifs(history)).toEqual(["Motif A", "Motif B"]);

    // Snapshot validation porte aussi le motif (pour journaux papier).
    const validation = history.find((h) => h.type === "validation")!;
    expect(validation.motif_snapshot).toBe("Motif B");
  });

  it("l'ordre chronologique des motifs est préservé (sort sur 'at' déjà croissant)", () => {
    let { state, history } = { state: initial(), history: [] as HistoryEvent[] };
    ({ state, history } = reduce(state, history, { kind: "soumettre" }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Premier", offsetMin: 10 }));
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 20 }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Deuxième", offsetMin: 30 }));
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 40 }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Troisième", offsetMin: 50 }));

    const motifs = derivedMotifs(history);
    expect(motifs).toEqual(["Premier", "Deuxième", "Troisième"]);

    // Vérifie que les timestamps sont bien strictement croissants.
    const rejetTimes = history
      .filter((h) => h.type === "rejet")
      .map((h) => new Date(h.at).getTime());
    for (let i = 1; i < rejetTimes.length; i++) {
      expect(rejetTimes[i]).toBeGreaterThan(rejetTimes[i - 1]);
    }
  });
});

describe("Conservation du motif — invariants forts", () => {
  it("aucune transition (sauf un nouveau rejet) ne doit EFFACER motif_rejet de la DB", () => {
    let { state, history } = { state: initial(), history: [] as HistoryEvent[] };
    ({ state, history } = reduce(state, history, { kind: "soumettre" }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Motif initial", offsetMin: 60 }));

    const motifPosé = state.motif_rejet;
    expect(motifPosé).toBe("Motif initial");

    // Re-soumission ne touche pas motif_rejet.
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 120 }));
    expect(state.motif_rejet).toBe(motifPosé);

    // Validation finale non plus.
    ({ state, history } = reduce(state, history, { kind: "valider", offsetMin: 180 }));
    expect(state.motif_rejet).toBe(motifPosé);
  });

  it("un nouveau rejet REMPLACE motif_rejet en DB mais l'ancien reste dans l'historique", () => {
    let { state, history } = { state: initial(), history: [] as HistoryEvent[] };
    ({ state, history } = reduce(state, history, { kind: "soumettre" }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Ancien", offsetMin: 60 }));
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 120 }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Nouveau", offsetMin: 180 }));

    expect(state.motif_rejet).toBe("Nouveau"); // remplacé en DB
    expect(derivedMotifs(history)).toContain("Ancien"); // mais traçable
    expect(derivedMotifs(history)).toContain("Nouveau");
  });

  it("nombre d'événements 'rejet' dans l'historique == nombre de motifs distincts produits", () => {
    let { state, history } = { state: initial(), history: [] as HistoryEvent[] };
    ({ state, history } = reduce(state, history, { kind: "soumettre" }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "M1", offsetMin: 10 }));
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 20 }));
    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "M2", offsetMin: 30 }));
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 40 }));
    ({ state, history } = reduce(state, history, { kind: "valider", offsetMin: 50 }));

    const rejets = history.filter((h) => h.type === "rejet");
    expect(rejets).toHaveLength(2);
    expect(derivedMotifs(history)).toHaveLength(2);
  });

  it("chaque événement post-rejet porte un motif_snapshot non null jusqu'à un éventuel reset", () => {
    let { state, history } = { state: initial(), history: [] as HistoryEvent[] };
    ({ state, history } = reduce(state, history, { kind: "soumettre" }));
    // Avant tout rejet : snapshots null
    expect(history[0].motif_snapshot).toBeNull();

    ({ state, history } = reduce(state, history, { kind: "rejeter", motif: "Motif", offsetMin: 60 }));
    ({ state, history } = reduce(state, history, { kind: "resoumettre", offsetMin: 120 }));
    ({ state, history } = reduce(state, history, { kind: "valider", offsetMin: 180 }));

    // Tous les événements à partir du rejet ont un snapshot non null.
    const idxRejet = history.findIndex((h) => h.type === "rejet");
    for (let i = idxRejet; i < history.length; i++) {
      expect(history[i].motif_snapshot).toBe("Motif");
    }
  });
});
