/**
 * v0.28.0 / v0.29.1 — Tests Vitest pour la vue Tableur opportunités.
 * Couvre : validation code 9XXX/5XXX, navigation Tab/Enter, fuzzy search,
 * filtres composés, presets dates, détection brouillon vide, overlay optimistic UI,
 * conditions d'édition Code 5XXX.
 */
import { describe, it, expect } from "vitest";
import {
  canEditCode5XXX,
  cleanOverlay,
  isValidCode5XXX,
  isValidCode9XXX,
  mergeRowOverlay,
  nextCell,
  fuzzySearchRow,
  applyTableurFilters,
  isDraftRowEmpty,
  dateRangeForPreset,
  TABLEUR_COLUMNS,
  STATUT_ROW_BG,
  type TableurRow,
  type TableurFilters,
} from "@/lib/opportunites-tableur-helpers";

function makeRow(overrides: Partial<TableurRow> = {}): TableurRow {
  return {
    id: "row-1",
    affaireId: "aff-1",
    numero: "9001",
    client: "Mercedes",
    nom: "Stand IAA",
    charge_affaires_id: "ca-1",
    date_opportunite: "2026-04-01",
    taille: "moyen",
    statut_opportunite: "envoye",
    code_opportunite: null,
    signed_affaire_numero: null,
    signed_affaire_id: null,
    date_pat: null,
    date_montage: null,
    date_demontage: null,
    notes: null,
    ...overrides,
  };
}

describe("isValidCode9XXX", () => {
  it("accepte les codes 9XXX valides (4 chiffres commençant par 9)", () => {
    expect(isValidCode9XXX("9000")).toBe(true);
    expect(isValidCode9XXX("9001")).toBe(true);
    expect(isValidCode9XXX("9999")).toBe(true);
  });
  it("trim les espaces", () => {
    expect(isValidCode9XXX(" 9123 ")).toBe(true);
  });
  it("rejette les codes hors format", () => {
    expect(isValidCode9XXX("8000")).toBe(false);
    expect(isValidCode9XXX("90000")).toBe(false);
    expect(isValidCode9XXX("900")).toBe(false);
    expect(isValidCode9XXX("abcd")).toBe(false);
    expect(isValidCode9XXX("")).toBe(false);
    expect(isValidCode9XXX("90A1")).toBe(false);
  });
});

describe("nextCell — navigation Tab/Enter", () => {
  it("Tab passe à la colonne suivante", () => {
    expect(nextCell(0, "code", "tab", 5)).toEqual({ row: 0, col: "client" });
    expect(nextCell(0, "client", "tab", 5)).toEqual({ row: 0, col: "deviseur" });
  });
  it("Tab en bout de ligne passe à la 1ère cellule de la ligne suivante", () => {
    const last = TABLEUR_COLUMNS[TABLEUR_COLUMNS.length - 1];
    expect(nextCell(0, last, "tab", 5)).toEqual({ row: 1, col: TABLEUR_COLUMNS[0] });
  });
  it("Tab en dernière cellule de la dernière ligne retourne null", () => {
    const last = TABLEUR_COLUMNS[TABLEUR_COLUMNS.length - 1];
    expect(nextCell(4, last, "tab", 5)).toBeNull();
  });
  it("Shift+Tab passe à la colonne précédente", () => {
    expect(nextCell(0, "client", "shift-tab", 5)).toEqual({ row: 0, col: "code" });
  });
  it("Shift+Tab en début de ligne passe à la dernière cellule de la ligne précédente", () => {
    const last = TABLEUR_COLUMNS[TABLEUR_COLUMNS.length - 1];
    expect(nextCell(2, "code", "shift-tab", 5)).toEqual({ row: 1, col: last });
  });
  it("Enter passe à la même colonne ligne suivante", () => {
    expect(nextCell(1, "client", "enter", 5)).toEqual({ row: 2, col: "client" });
  });
  it("Enter sur dernière ligne retourne null", () => {
    expect(nextCell(4, "client", "enter", 5)).toBeNull();
  });
  it("Shift+Enter remonte d'une ligne", () => {
    expect(nextCell(2, "taille", "shift-enter", 5)).toEqual({ row: 1, col: "taille" });
  });
  it("retourne null pour une colonne inconnue", () => {
    expect(nextCell(0, "unknown" as never, "tab", 5)).toBeNull();
  });
});

describe("fuzzySearchRow", () => {
  it("retourne true pour requête vide", () => {
    expect(fuzzySearchRow(makeRow(), "")).toBe(true);
    expect(fuzzySearchRow(makeRow(), "   ")).toBe(true);
  });
  it("matche par client (case + accents insensibles)", () => {
    expect(fuzzySearchRow(makeRow({ client: "Hermès" }), "hermes")).toBe(true);
    expect(fuzzySearchRow(makeRow({ client: "Hermès" }), "HERMÈS")).toBe(true);
  });
  it("matche par numéro", () => {
    expect(fuzzySearchRow(makeRow({ numero: "9042" }), "9042")).toBe(true);
  });
  it("matche par nom de chantier", () => {
    expect(fuzzySearchRow(makeRow({ nom: "Stand IAA 2026" }), "iaa 2026")).toBe(true);
  });
  it("matche par notes", () => {
    expect(fuzzySearchRow(makeRow({ notes: "urgent retour client" }), "urgent")).toBe(true);
  });
  it("ne matche pas si un token manque (AND)", () => {
    expect(fuzzySearchRow(makeRow({ client: "Mercedes" }), "mercedes audi")).toBe(false);
  });
});

describe("applyTableurFilters", () => {
  const baseRows: TableurRow[] = [
    makeRow({ id: "r1", numero: "9001", statut_opportunite: "a_faire", taille: "petit", charge_affaires_id: "ca-1", date_opportunite: "2026-04-15", client: "Mercedes" }),
    makeRow({ id: "r2", numero: "9002", statut_opportunite: "envoye", taille: "moyen", charge_affaires_id: "ca-2", date_opportunite: "2026-03-15", client: "Hermès" }),
    makeRow({ id: "r3", numero: "9003", statut_opportunite: "gagne", taille: "gros", charge_affaires_id: "ca-1", date_opportunite: "2026-04-20", client: "Audi" }),
  ];
  const empty: TableurFilters = {
    statuts: [],
    tailles: [],
    deviseurs: [],
    dateFrom: null,
    dateTo: null,
    search: "",
  };
  it("aucun filtre = toutes les lignes", () => {
    expect(applyTableurFilters(baseRows, empty)).toHaveLength(3);
  });
  it("filtre statut", () => {
    const out = applyTableurFilters(baseRows, { ...empty, statuts: ["envoye"] });
    expect(out.map((r) => r.id)).toEqual(["r2"]);
  });
  it("filtre taille", () => {
    const out = applyTableurFilters(baseRows, { ...empty, tailles: ["gros", "moyen"] });
    expect(out.map((r) => r.id).sort()).toEqual(["r2", "r3"]);
  });
  it("filtre deviseur", () => {
    const out = applyTableurFilters(baseRows, { ...empty, deviseurs: ["ca-1"] });
    expect(out.map((r) => r.id).sort()).toEqual(["r1", "r3"]);
  });
  it("filtre plage dates", () => {
    const out = applyTableurFilters(baseRows, {
      ...empty,
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
    });
    expect(out.map((r) => r.id).sort()).toEqual(["r1", "r3"]);
  });
  it("filtre recherche fuzzy combiné avec statut", () => {
    const out = applyTableurFilters(baseRows, {
      ...empty,
      statuts: ["a_faire", "envoye"],
      search: "mercedes",
    });
    expect(out.map((r) => r.id)).toEqual(["r1"]);
  });
});

describe("isDraftRowEmpty", () => {
  it("retourne true pour brouillon vraiment vide (juste un code)", () => {
    const draft = makeRow({
      affaireId: null,
      client: "",
      nom: "",
      charge_affaires_id: null,
      date_opportunite: null,
      taille: null,
      notes: null,
      date_pat: null,
      date_montage: null,
      date_demontage: null,
    });
    expect(isDraftRowEmpty(draft)).toBe(true);
  });
  it("retourne false dès qu'un champ est saisi", () => {
    const draft = makeRow({ affaireId: null, client: "X" });
    expect(isDraftRowEmpty(draft)).toBe(false);
  });
  it("retourne false pour ligne persistée (affaireId non null)", () => {
    expect(isDraftRowEmpty(makeRow({ affaireId: "abc" }))).toBe(false);
  });
});

describe("dateRangeForPreset", () => {
  const ref = new Date("2026-04-30T12:00:00Z");
  it("all = pas de borne", () => {
    expect(dateRangeForPreset("all", ref)).toEqual({ from: null, to: null });
  });
  it("7d = 7 jours en arrière", () => {
    const r = dateRangeForPreset("7d", ref);
    expect(r.from).toBe("2026-04-23");
    expect(r.to).toBe("2026-04-30");
  });
  it("30d = 30 jours en arrière", () => {
    const r = dateRangeForPreset("30d", ref);
    expect(r.from).toBe("2026-03-31");
    expect(r.to).toBe("2026-04-30");
  });
  it("current_month = du 1er au dernier jour du mois", () => {
    const r = dateRangeForPreset("current_month", ref);
    expect(r.from).toBe("2026-04-01");
    expect(r.to).toBe("2026-04-30");
  });
  it("custom = pas de borne (à gérer en UI)", () => {
    expect(dateRangeForPreset("custom", ref)).toEqual({ from: null, to: null });
  });
});

describe("STATUT_ROW_BG — coloration par statut", () => {
  it("définit une classe pour chaque statut", () => {
    expect(STATUT_ROW_BG.a_faire).toBeTruthy();
    expect(STATUT_ROW_BG.envoye).toBeTruthy();
    expect(STATUT_ROW_BG.gagne).toBeTruthy();
    expect(STATUT_ROW_BG.perdu).toBeTruthy();
    expect(STATUT_ROW_BG.termine).toBeTruthy();
  });
  it("inclut une nuance verte pour gagné", () => {
    expect(STATUT_ROW_BG.gagne).toMatch(/emerald|green/);
  });
  it("inclut une nuance rouge pour perdu", () => {
    expect(STATUT_ROW_BG.perdu).toMatch(/rose|red/);
  });
});

describe("TABLEUR_COLUMNS — ordre déterministe (v0.29.1: PAT retiré)", () => {
  it("contient les 10 colonnes éditables dans l'ordre, sans date_pat", () => {
    expect(TABLEUR_COLUMNS).toEqual([
      "code",
      "client",
      "deviseur",
      "date_opportunite",
      "taille",
      "statut",
      "code_5xxx",
      "date_montage",
      "date_demontage",
      "commentaires",
    ]);
  });
  it("ne contient plus date_pat", () => {
    expect(TABLEUR_COLUMNS).not.toContain("date_pat");
  });
  it("inclut code_5xxx (éditable conditionnel)", () => {
    expect(TABLEUR_COLUMNS).toContain("code_5xxx");
  });
});

// ============================================================================
// v0.29.1 — Hotfix : validation Code 5XXX + overlay optimistic UI
// ============================================================================

describe("isValidCode5XXX — validation regex /^5\\d{3}$/", () => {
  it("accepte les codes 5XXX valides", () => {
    expect(isValidCode5XXX("5000")).toBe(true);
    expect(isValidCode5XXX("5001")).toBe(true);
    expect(isValidCode5XXX("5999")).toBe(true);
  });
  it("trim les espaces", () => {
    expect(isValidCode5XXX(" 5123 ")).toBe(true);
  });
  it("rejette les codes hors format", () => {
    expect(isValidCode5XXX("4000")).toBe(false); // pas de 4XXX
    expect(isValidCode5XXX("9001")).toBe(false); // 9XXX = opportunité, pas signée
    expect(isValidCode5XXX("50000")).toBe(false); // trop long
    expect(isValidCode5XXX("500")).toBe(false); // trop court
    expect(isValidCode5XXX("abcd")).toBe(false);
    expect(isValidCode5XXX("")).toBe(false);
    expect(isValidCode5XXX("50A1")).toBe(false);
  });
});

describe("canEditCode5XXX — règle d'édition conditionnelle", () => {
  it("autorise admin + statut gagne + non signée", () => {
    expect(
      canEditCode5XXX({
        statut: "gagne",
        isAdmin: true,
        isOwner: false,
        alreadySigned: false,
      }),
    ).toBe(true);
  });
  it("autorise CA propriétaire + statut gagne + non signée", () => {
    expect(
      canEditCode5XXX({
        statut: "gagne",
        isAdmin: false,
        isOwner: true,
        alreadySigned: false,
      }),
    ).toBe(true);
  });
  it("refuse CA non propriétaire (même si gagne)", () => {
    expect(
      canEditCode5XXX({
        statut: "gagne",
        isAdmin: false,
        isOwner: false,
        alreadySigned: false,
      }),
    ).toBe(false);
  });
  it("refuse si statut != gagne (a_faire/envoye/perdu/termine)", () => {
    for (const statut of ["a_faire", "envoye", "perdu", "termine"] as const) {
      expect(
        canEditCode5XXX({
          statut,
          isAdmin: true,
          isOwner: true,
          alreadySigned: false,
        }),
      ).toBe(false);
    }
  });
  it("refuse si déjà signée (évite double signature)", () => {
    expect(
      canEditCode5XXX({
        statut: "gagne",
        isAdmin: true,
        isOwner: true,
        alreadySigned: true,
      }),
    ).toBe(false);
  });
  it("refuse si statut null", () => {
    expect(
      canEditCode5XXX({
        statut: null,
        isAdmin: true,
        isOwner: true,
        alreadySigned: false,
      }),
    ).toBe(false);
  });
});

describe("mergeRowOverlay — optimistic UI (anti perte de focus)", () => {
  it("retourne la ligne serveur si pas d'overlay", () => {
    const server = makeRow();
    expect(mergeRowOverlay(server, undefined)).toBe(server);
  });
  it("retourne la ligne serveur si overlay vide", () => {
    const server = makeRow();
    const result = mergeRowOverlay(server, {});
    expect(result).toBe(server); // référence inchangée → pas de re-render
  });
  it("applique l'overlay champ par champ", () => {
    const server = makeRow({ client: "Mercedes", taille: "petit" });
    const merged = mergeRowOverlay(server, { client: "Audi" });
    expect(merged.client).toBe("Audi");
    expect(merged.taille).toBe("petit"); // inchangé
  });
  it("l'overlay l'emporte sur le serveur (clé existante)", () => {
    const server = makeRow({ statut_opportunite: "a_faire" });
    const merged = mergeRowOverlay(server, { statut_opportunite: "gagne" });
    expect(merged.statut_opportunite).toBe("gagne");
  });
  it("supporte les valeurs null dans l'overlay", () => {
    const server = makeRow({ taille: "petit" });
    const merged = mergeRowOverlay(server, { taille: null });
    expect(merged.taille).toBeNull();
  });
});

describe("cleanOverlay — purge des clés synchronisées", () => {
  it("retourne undefined si toutes les clés sont synchronisées", () => {
    const server = makeRow({ client: "Mercedes" });
    const overlay = { client: "Mercedes" };
    expect(cleanOverlay(overlay, server)).toBeUndefined();
  });
  it("garde les clés divergentes", () => {
    const server = makeRow({ client: "Mercedes", taille: "petit" });
    const overlay: Partial<TableurRow> = { client: "Audi", taille: "petit" };
    const cleaned = cleanOverlay(overlay, server);
    expect(cleaned).toEqual({ client: "Audi" });
  });
  it("retourne undefined pour overlay vide", () => {
    expect(cleanOverlay({}, makeRow())).toBeUndefined();
  });
});
