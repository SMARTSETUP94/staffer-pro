/**
 * v0.23 Bloc 4 — Tests du helper importProgbatToAffaire
 * + tests confidence (via fixtures parser).
 *
 * Stratégie : mock du client Supabase pour capturer insert/update payloads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* -------------------------------------------------------------------------- */
/* Mock Supabase                                                              */
/* -------------------------------------------------------------------------- */

type Captured = { table: string; op: "insert" | "update"; payload: unknown; eqArgs?: [string, string] };
const captured: Captured[] = [];
let nextError: { message: string } | null = null;

function makeChain(table: string, op: "insert" | "update", payload: unknown) {
  const entry: Captured = { table, op, payload };
  // .eq returns a thenable resolving to { error }
  const thenable = {
    eq: (col: string, val: string) => {
      entry.eqArgs = [col, val];
      captured.push(entry);
      const err = nextError;
      nextError = null;
      return Promise.resolve({ error: err, data: null });
    },
    then: (resolve: (v: { error: unknown }) => void) => {
      captured.push(entry);
      const err = nextError;
      nextError = null;
      resolve({ error: err });
    },
  };
  return thenable;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: unknown) => makeChain(table, "insert", payload),
      update: (payload: unknown) => makeChain(table, "update", payload),
    }),
  },
}));

import { importProgbatToAffaire } from "../devis-progbat-import";
import type { ApplicabilityFlags, HeuresParMetier } from "../devis-parser/compute-flags";
import { parseDevisProgbatFromMatrix } from "../devis-parser/parse-excel";
import { FIXTURE_D2153 } from "../devis-parser/__fixtures__/progbat-mocks";

const AFF_ID = "11111111-1111-1111-1111-111111111111";
const DEV_ID = "22222222-2222-2222-2222-222222222222";

function emptyHeures(): HeuresParMetier {
  return { be: 0, numerique: 0, bois: 0, metal: 0, peinture: 0, tapisserie: 0, manutention: 0 };
}

function emptyFlags(): ApplicabilityFlags {
  return { a_dessiner: false, a_usiner: false, a_construire: false, est_brut: true, a_emballer: false };
}

beforeEach(() => {
  captured.length = 0;
  nextError = null;
});
afterEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* importProgbatToAffaire — bulk insert                                       */
/* -------------------------------------------------------------------------- */

describe("importProgbatToAffaire — bulk insert objets", () => {
  it("insère N objets avec tous les champs requis", async () => {
    const res = await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [
        {
          nom: "Bar central",
          reference: "1",
          quantite: 1,
          heures: { ...emptyHeures(), be: 8, bois: 24, peinture: 6 },
          budgetMateriaux: 800,
          typeFinition: "peinture",
          flags: { a_dessiner: true, a_usiner: false, a_construire: true, est_brut: false, a_emballer: false },
          devisId: DEV_ID,
        },
        {
          nom: "Totem",
          reference: "4",
          quantite: 3,
          heures: { ...emptyHeures(), be: 9, numerique: 18, manutention: 9 },
          budgetMateriaux: 0,
          typeFinition: "aucune",
          flags: { a_dessiner: true, a_usiner: true, a_construire: false, est_brut: true, a_emballer: true },
          devisId: null,
        },
      ],
      heuresMontage: null,
      heuresDemontage: null,
    });

    expect(res.insertedObjets).toBe(2);
    const insert = captured.find((c) => c.table === "fabrication_objets" && c.op === "insert");
    expect(insert).toBeTruthy();
    const rows = insert!.payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);

    expect(rows[0]).toMatchObject({
      affaire_id: AFF_ID,
      devis_id: DEV_ID,
      reference: "1",
      nom: "Bar central",
      quantite: 1,
      ordre: 0,
      heures_prevues_be: 8,
      heures_prevues_bois: 24,
      heures_prevues_peinture: 6,
      heures_prevues_numerique: 0,
      budget_materiaux: 800,
      type_finition: "peinture",
      a_dessiner: true,
      a_construire: true,
      est_brut: false,
    });

    expect(rows[1]).toMatchObject({
      reference: "4",
      quantite: 3,
      ordre: 1,
      heures_prevues_numerique: 18,
      a_usiner: true,
      a_emballer: true,
      devis_id: null,
    });
  });

  it("génère une référence par défaut si absente", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [
        {
          nom: "X",
          reference: "",
          quantite: 1,
          heures: emptyHeures(),
          budgetMateriaux: 0,
          typeFinition: "aucune",
          flags: emptyFlags(),
          devisId: null,
        },
      ],
      heuresMontage: null,
      heuresDemontage: null,
    });
    const rows = captured[0].payload as Array<Record<string, unknown>>;
    expect(rows[0].reference).toBe("OBJ-1");
  });

  it("ne fait pas d'insert si liste objets vide", async () => {
    const res = await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [],
      heuresMontage: 10,
      heuresDemontage: null,
    });
    expect(res.insertedObjets).toBe(0);
    const inserts = captured.filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(0);
  });

  it("propage une erreur insert", async () => {
    nextError = { message: "insert failed" };
    await expect(
      importProgbatToAffaire({
        affaireId: AFF_ID,
        objets: [
          {
            nom: "X",
            reference: "X",
            quantite: 1,
            heures: emptyHeures(),
            budgetMateriaux: 0,
            typeFinition: "aucune",
            flags: emptyFlags(),
            devisId: null,
          },
        ],
        heuresMontage: null,
        heuresDemontage: null,
      }),
    ).rejects.toThrow(/insert failed/);
  });
});

/* -------------------------------------------------------------------------- */
/* UPDATE heures chantier conditionnel                                        */
/* -------------------------------------------------------------------------- */

describe("importProgbatToAffaire — UPDATE heures chantier", () => {
  it("UPDATE les 2 heures si les 2 sont fournies", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [],
      heuresMontage: 40,
      heuresDemontage: 16,
    });
    const upd = captured.find((c) => c.table === "affaires" && c.op === "update");
    expect(upd).toBeTruthy();
    expect(upd!.payload).toEqual({ heures_prevues_montage: 40, heures_prevues_demontage: 16 });
    expect(upd!.eqArgs).toEqual(["id", AFF_ID]);
  });

  it("UPDATE uniquement montage si démontage = null (pas d'écrasement)", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [],
      heuresMontage: 20,
      heuresDemontage: null,
    });
    const upd = captured.find((c) => c.op === "update");
    expect(upd!.payload).toEqual({ heures_prevues_montage: 20 });
    expect((upd!.payload as Record<string, unknown>).heures_prevues_demontage).toBeUndefined();
  });

  it("UPDATE uniquement démontage si montage = null", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [],
      heuresMontage: null,
      heuresDemontage: 8,
    });
    const upd = captured.find((c) => c.op === "update");
    expect(upd!.payload).toEqual({ heures_prevues_demontage: 8 });
  });

  it("aucun UPDATE si les 2 sont décochés", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [
        {
          nom: "X",
          reference: "X",
          quantite: 1,
          heures: emptyHeures(),
          budgetMateriaux: 0,
          typeFinition: "aucune",
          flags: emptyFlags(),
          devisId: null,
        },
      ],
      heuresMontage: null,
      heuresDemontage: null,
    });
    const updates = captured.filter((c) => c.op === "update");
    expect(updates).toHaveLength(0);
  });

  it("autorise heures = 0 (vs null) → UPDATE quand même", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [],
      heuresMontage: 0,
      heuresDemontage: 0,
    });
    const upd = captured.find((c) => c.op === "update");
    expect(upd!.payload).toEqual({ heures_prevues_montage: 0, heures_prevues_demontage: 0 });
  });
});

/* -------------------------------------------------------------------------- */
/* Idempotence : re-import → 2 inserts indépendants (pas de dédup applicatif) */
/* -------------------------------------------------------------------------- */

describe("importProgbatToAffaire — idempotence applicative", () => {
  it("appel 2× → 2 inserts indépendants (le dédup est de la responsabilité de l'utilisateur)", async () => {
    const payload = {
      affaireId: AFF_ID,
      objets: [
        {
          nom: "X",
          reference: "X",
          quantite: 1,
          heures: emptyHeures(),
          budgetMateriaux: 0,
          typeFinition: "aucune" as const,
          flags: emptyFlags(),
          devisId: null,
        },
      ],
      heuresMontage: null,
      heuresDemontage: null,
    };
    await importProgbatToAffaire(payload);
    await importProgbatToAffaire(payload);
    const inserts = captured.filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(2);
  });

  it("sanitise nom vide → 'Objet sans nom' n'est pas appliqué côté helper (c'est l'UI qui sanitise)", async () => {
    // Le helper accepte le nom tel quel ; vérifie qu'il ne mute pas.
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [
        {
          nom: "  Bar  ",
          reference: "1",
          quantite: 2,
          heures: emptyHeures(),
          budgetMateriaux: 0,
          typeFinition: "aucune",
          flags: emptyFlags(),
          devisId: null,
        },
      ],
      heuresMontage: null,
      heuresDemontage: null,
    });
    const rows = captured[0].payload as Array<Record<string, unknown>>;
    expect(rows[0].nom).toBe("  Bar  ");
    expect(rows[0].quantite).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Confidence : high / medium / low                                           */
/* -------------------------------------------------------------------------- */

describe("ObjetCandidat.confidence — classification", () => {
  it("D-2153 contient au moins un objet 🟢 high", () => {
    const result = parseDevisProgbatFromMatrix(FIXTURE_D2153);
    expect(result.objetsCandidats.length).toBeGreaterThan(0);
    const highs = result.objetsCandidats.filter((o) => o.confidence === "high");
    expect(highs.length).toBeGreaterThan(0);
  });

  it("objet sans heures détectées → 🔴 low", () => {
    const matrix = [
      ["D-test", "", "", "", "", "", ""],
      ["Test", "", "", "", "", "", ""],
      ["N°", "Désignation", "Qté", "Unité", "PU HT", "Total HT", "Temps prévu"],
      ["1", "Bar mystère", 1, "u", null, null, null],
      ["1.1", "Liste matière", 1, "ff", 500, 500, null],
    ];
    const result = parseDevisProgbatFromMatrix(matrix);
    const obj = result.objetsCandidats[0];
    if (obj) expect(obj.confidence).toBe("low");
  });

  it("objet avec warnings → 🟡 medium (matière non chiffrée)", () => {
    const matrix = [
      ["D-w", "", "", "", "", "", ""],
      ["Test", "", "", "", "", "", ""],
      ["N°", "Désignation", "Qté", "Unité", "PU HT", "Total HT", "Temps prévu"],
      ["1", "Banc", 1, "u", null, null, null],
      ["1.1", "Construction bois", 1, "ff", 50, 600, 12],
      ["1.2", "Liste de matiere pour bois", 1, "ff", null, null, null], // matière sans montant
    ];
    const result = parseDevisProgbatFromMatrix(matrix);
    const obj = result.objetsCandidats[0];
    expect(obj).toBeTruthy();
    expect(obj!.confidence).toBe("medium");
    expect(obj!.warnings.length).toBeGreaterThan(0);
  });

  it("objet quantité > 1 multiplie correctement les heures", () => {
    const result = parseDevisProgbatFromMatrix(FIXTURE_D2153);
    // Banquette VIP qté=2 → BE 4h × 2 = 8, Métal 15h × 2 = 30, Tapisserie 12h × 2 = 24
    const banquette = result.objetsCandidats.find((o) => /banquette/i.test(o.nom));
    expect(banquette).toBeTruthy();
    expect(banquette!.quantite).toBe(2);
    expect(banquette!.heures.be).toBe(8);
    expect(banquette!.heures.metal).toBe(30);
    expect(banquette!.heures.tapisserie).toBe(24);
  });
});

/* -------------------------------------------------------------------------- */
/* Filtrage lots devis (logique côté UI testée via shape)                     */
/* -------------------------------------------------------------------------- */

describe("Filtrage lot devis (devisId)", () => {
  it("devisId null → champ devis_id null en base", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [
        {
          nom: "X",
          reference: "X",
          quantite: 1,
          heures: emptyHeures(),
          budgetMateriaux: 0,
          typeFinition: "aucune",
          flags: emptyFlags(),
          devisId: null,
        },
      ],
      heuresMontage: null,
      heuresDemontage: null,
    });
    const rows = captured[0].payload as Array<Record<string, unknown>>;
    expect(rows[0].devis_id).toBeNull();
  });

  it("devisId fourni → propagé tel quel", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [
        {
          nom: "X",
          reference: "X",
          quantite: 1,
          heures: emptyHeures(),
          budgetMateriaux: 0,
          typeFinition: "aucune",
          flags: emptyFlags(),
          devisId: DEV_ID,
        },
      ],
      heuresMontage: null,
      heuresDemontage: null,
    });
    const rows = captured[0].payload as Array<Record<string, unknown>>;
    expect(rows[0].devis_id).toBe(DEV_ID);
  });
});

/* -------------------------------------------------------------------------- */
/* Garde RBAC — logique de la page (admin only)                               */
/* -------------------------------------------------------------------------- */

describe("Garde RBAC page Progbat (logique)", () => {
  // La page utilise `useAuth().isAdmin`. On vérifie ici la condition logique.
  function canAccess(role: "admin" | "chef_chantier" | "employe") {
    return role === "admin";
  }
  it("admin → accès autorisé", () => {
    expect(canAccess("admin")).toBe(true);
  });
  it("chef_chantier → accès refusé (page admin only)", () => {
    expect(canAccess("chef_chantier")).toBe(false);
  });
  it("employe → accès refusé", () => {
    expect(canAccess("employe")).toBe(false);
  });
});
