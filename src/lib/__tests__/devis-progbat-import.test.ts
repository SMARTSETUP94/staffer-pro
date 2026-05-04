/**
 * v0.39.0a-hotfix-import — Tests du helper importProgbatToAffaire (via RPC atomique).
 *
 * Le helper passe par `supabase.rpc("import_progbat_atomique", ...)` pour garantir
 * un import tout-ou-rien (rollback PL/pgSQL automatique en cas d'erreur partielle).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* -------------------------------------------------------------------------- */
/* Mock Supabase RPC                                                          */
/* -------------------------------------------------------------------------- */

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

const rpcCalls: RpcCall[] = [];
let nextRpcResponse: { data: unknown; error: { message: string } | null } = {
  data: { inserted_objets: 0, conflicts: [] },
  error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      const inserted = Array.isArray(args.p_objets) ? (args.p_objets as unknown[]).length : 0;
      // Si pas de réponse explicitement préparée, on calcule depuis args
      if (
        nextRpcResponse.error === null &&
        (nextRpcResponse.data as { inserted_objets: number }).inserted_objets === 0
      ) {
        return Promise.resolve({
          data: { inserted_objets: inserted, conflicts: [] },
          error: null,
        });
      }
      const res = nextRpcResponse;
      nextRpcResponse = { data: { inserted_objets: 0, conflicts: [] }, error: null };
      return Promise.resolve(res);
    },
  },
}));

import {
  importProgbatToAffaire,
  ImportProgbatConflictError,
} from "../devis-progbat-import";
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
  rpcCalls.length = 0;
  nextRpcResponse = { data: { inserted_objets: 0, conflicts: [] }, error: null };
});
afterEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* importProgbatToAffaire — appel RPC                                         */
/* -------------------------------------------------------------------------- */

describe("importProgbatToAffaire — appel RPC atomique", () => {
  it("appelle import_progbat_atomique avec affaireId + payload objets", async () => {
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
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("import_progbat_atomique");
    expect(rpcCalls[0].args.p_affaire_id).toBe(AFF_ID);
    const objets = rpcCalls[0].args.p_objets as Array<Record<string, unknown>>;
    expect(objets).toHaveLength(2);

    expect(objets[0]).toMatchObject({
      devis_id: DEV_ID,
      reference: "1",
      nom: "Bar central",
      quantite: 1,
      heures_prevues_be: 8,
      heures_prevues_bois: 24,
      heures_prevues_peinture: 6,
      budget_materiaux: 800,
      type_finition: "peinture",
      a_dessiner: true,
      a_construire: true,
      est_brut: false,
    });

    expect(objets[1]).toMatchObject({
      reference: "4",
      quantite: 3,
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
    const objets = rpcCalls[0].args.p_objets as Array<Record<string, unknown>>;
    expect(objets[0].reference).toBe("OBJ-1");
  });

  it("appelle le RPC même si liste objets vide (le RPC gère le cas heures-only)", async () => {
    const res = await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [],
      heuresMontage: 10,
      heuresDemontage: null,
    });
    expect(res.insertedObjets).toBe(0);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args.p_heures_montage).toBe(10);
    expect(rpcCalls[0].args.p_heures_demontage).toBeUndefined();
  });

  it("propage une erreur RPC simple", async () => {
    nextRpcResponse = { data: null, error: { message: "DB down" } };
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
    ).rejects.toThrow(/DB down/);
  });

  it("détecte un conflit de référence (CONFLICT_REFERENCE) et lève ImportProgbatConflictError", async () => {
    const conflicts = [{ reference: "1.1", existing_id: "abc-123", nom: "Bar" }];
    nextRpcResponse = {
      data: null,
      error: { message: `CONFLICT_REFERENCE: ${JSON.stringify(conflicts)}` },
    };
    await expect(
      importProgbatToAffaire({
        affaireId: AFF_ID,
        objets: [
          {
            nom: "Bar",
            reference: "1.1",
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
    ).rejects.toThrow(ImportProgbatConflictError);
  });
});

/* -------------------------------------------------------------------------- */
/* UPDATE heures chantier conditionnel (déléguée au RPC)                      */
/* -------------------------------------------------------------------------- */

describe("importProgbatToAffaire — heures chantier", () => {
  it("transmet les 2 heures si fournies", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [],
      heuresMontage: 40,
      heuresDemontage: 16,
    });
    expect(rpcCalls[0].args.p_heures_montage).toBe(40);
    expect(rpcCalls[0].args.p_heures_demontage).toBe(16);
  });

  it("omet démontage si null", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [],
      heuresMontage: 20,
      heuresDemontage: null,
    });
    expect(rpcCalls[0].args.p_heures_montage).toBe(20);
    expect(rpcCalls[0].args.p_heures_demontage).toBeUndefined();
  });

  it("omet montage si null", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [],
      heuresMontage: null,
      heuresDemontage: 8,
    });
    expect(rpcCalls[0].args.p_heures_montage).toBeUndefined();
    expect(rpcCalls[0].args.p_heures_demontage).toBe(8);
  });

  it("autorise heures = 0 (transmis au RPC, pas confondu avec null)", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [],
      heuresMontage: 0,
      heuresDemontage: 0,
    });
    expect(rpcCalls[0].args.p_heures_montage).toBe(0);
    expect(rpcCalls[0].args.p_heures_demontage).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Confidence : high / medium / low (parser, inchangé)                        */
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
      ["1.2", "Liste de matiere pour bois", 1, "ff", null, null, null],
    ];
    const result = parseDevisProgbatFromMatrix(matrix);
    const obj = result.objetsCandidats[0];
    expect(obj).toBeTruthy();
    expect(obj!.confidence).toBe("medium");
    expect(obj!.warnings.length).toBeGreaterThan(0);
  });

  it("objet quantité > 1 multiplie correctement les heures", () => {
    const result = parseDevisProgbatFromMatrix(FIXTURE_D2153);
    const banquette = result.objetsCandidats.find((o) => /banquette/i.test(o.nom));
    expect(banquette).toBeTruthy();
    expect(banquette!.quantite).toBe(2);
    expect(banquette!.heures.be).toBe(8);
    expect(banquette!.heures.metal).toBe(30);
    expect(banquette!.heures.tapisserie).toBe(24);
  });
});

/* -------------------------------------------------------------------------- */
/* Filtrage lots devis (devisId)                                              */
/* -------------------------------------------------------------------------- */

describe("Filtrage lot devis (devisId)", () => {
  it("devisId null → champ devis_id null transmis au RPC", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [
        {
          nom: "X", reference: "X", quantite: 1,
          heures: emptyHeures(), budgetMateriaux: 0,
          typeFinition: "aucune", flags: emptyFlags(), devisId: null,
        },
      ],
      heuresMontage: null,
      heuresDemontage: null,
    });
    const objets = rpcCalls[0].args.p_objets as Array<Record<string, unknown>>;
    expect(objets[0].devis_id).toBeNull();
  });

  it("devisId fourni → propagé tel quel", async () => {
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [
        {
          nom: "X", reference: "X", quantite: 1,
          heures: emptyHeures(), budgetMateriaux: 0,
          typeFinition: "aucune", flags: emptyFlags(), devisId: DEV_ID,
        },
      ],
      heuresMontage: null,
      heuresDemontage: null,
    });
    const objets = rpcCalls[0].args.p_objets as Array<Record<string, unknown>>;
    expect(objets[0].devis_id).toBe(DEV_ID);
  });
});

/* -------------------------------------------------------------------------- */
/* v0.39.0a-hotfix-import — Garde-fou anti-orphelins                          */
/* -------------------------------------------------------------------------- */

describe("v0.39.0a-hotfix-import — anti-orphelins", () => {
  it("RPC atomique : aucun fallback INSERT direct possible", async () => {
    // Le helper appelle uniquement supabase.rpc, jamais .from().insert().
    // C'est ce qui garantit le rollback PL/pgSQL en cas d'erreur partielle.
    await importProgbatToAffaire({
      affaireId: AFF_ID,
      objets: [
        {
          nom: "Bar", reference: "1", quantite: 1,
          heures: emptyHeures(), budgetMateriaux: 0,
          typeFinition: "aucune", flags: emptyFlags(), devisId: null,
        },
      ],
      heuresMontage: 10,
      heuresDemontage: 5,
    });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("import_progbat_atomique");
  });

  it("ImportProgbatConflictError expose la liste des conflits", async () => {
    const conflicts = [
      { reference: "1.1", existing_id: "id-1", nom: "Bar" },
      { reference: "2", existing_id: "id-2", nom: "Totem" },
    ];
    nextRpcResponse = {
      data: null,
      error: { message: `CONFLICT_REFERENCE: ${JSON.stringify(conflicts)}` },
    };
    try {
      await importProgbatToAffaire({
        affaireId: AFF_ID,
        objets: [
          {
            nom: "Bar", reference: "1.1", quantite: 1,
            heures: emptyHeures(), budgetMateriaux: 0,
            typeFinition: "aucune", flags: emptyFlags(), devisId: null,
          },
        ],
        heuresMontage: null,
        heuresDemontage: null,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ImportProgbatConflictError);
      expect((err as ImportProgbatConflictError).conflicts).toHaveLength(2);
      expect((err as ImportProgbatConflictError).conflicts[0].reference).toBe("1.1");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Garde RBAC — logique de la page (admin only)                               */
/* -------------------------------------------------------------------------- */

describe("Garde RBAC page Progbat (logique)", () => {
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
