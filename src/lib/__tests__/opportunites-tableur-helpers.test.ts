/**
 * v0.28.0 — Tests Vitest pour la vue Tableur opportunités.
 * Couvre : validation code 9XXX, navigation Tab/Enter, fuzzy search,
 * filtres composés, presets dates, détection brouillon vide.
 */
import { describe, it, expect } from "vitest";
import {
  isValidCode9XXX,
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

describe("TABLEUR_COLUMNS — ordre déterministe", () => {
  it("contient les 10 colonnes éditables dans l'ordre", () => {
    expect(TABLEUR_COLUMNS).toEqual([
      "code",
      "client",
      "deviseur",
      "date_opportunite",
      "taille",
      "statut",
      "date_pat",
      "date_montage",
      "date_demontage",
      "commentaires",
    ]);
  });
});
