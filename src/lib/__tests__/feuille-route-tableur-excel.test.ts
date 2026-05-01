/**
 * v0.33 — Tests export Excel matriciel Feuille de Route Tableur.
 *
 * On vérifie la construction de l'AOA (array-of-arrays) :
 *   - en-têtes
 *   - overrides reflétés (adresse, horaire, opération, commentaires, véhicules)
 *   - badge discordance véhicules
 *   - typologie future prioritaire sur typologie courante
 *   - ordre stable des lignes (déjà trié côté hook)
 */
import { describe, expect, it } from "vitest";
import {
  buildFRTableurAOA,
  buildFRTableurWorkbook,
  type VehiculeLite,
} from "@/lib/feuille-route-tableur-excel";
import type { FRTableurRow } from "@/lib/feuille-route-tableur-helpers";

const VEHICULES: VehiculeLite[] = [
  { id: "v1", nom: "Camion A" },
  { id: "v2", nom: "Camion B" },
];

function makeRow(overrides: Partial<FRTableurRow> = {}): FRTableurRow {
  return {
    id: "2026-05-01|aff-1",
    overrideId: null,
    date: "2026-05-01",
    affaire_id: "aff-1",
    affaire_numero: "4001",
    affaire_nom: "Chantier Test",
    affaire_lieu: "10 rue Default",
    typologie_courante: "montage_demontage",
    typologie_future: null,
    type_operation: null,
    horaire_rdv: null,
    adresse_override: null,
    adresse_affichee: "10 rue Default",
    commentaires: null,
    vehicules_ids: [],
    vehicules_reels_ids: [],
    vehicules_discordance: false,
    responsable_id: null,
    responsable_label: "Jean DUPONT",
    responsable_source: "chef_du_jour",
    staffe: true,
    ...overrides,
  };
}

describe("buildFRTableurAOA", () => {
  it("génère l'en-tête sur la première ligne (12 colonnes)", () => {
    const aoa = buildFRTableurAOA({
      rows: [],
      vehicules: VEHICULES,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-14"),
    });
    expect(aoa).toHaveLength(1);
    expect(aoa[0]).toEqual([
      "Date",
      "Code",
      "Typologie",
      "Nom chantier",
      "Adresse",
      "Responsable",
      "Opération",
      "Horaire RDV",
      "Véhicules (plan)",
      "Véhicules (réels)",
      "Discordance",
      "Commentaires",
    ]);
  });

  it("reflète les overrides (adresse, horaire, opération, commentaires)", () => {
    const aoa = buildFRTableurAOA({
      rows: [
        makeRow({
          adresse_override: "5 rue Override",
          adresse_affichee: "5 rue Override",
          horaire_rdv: "07:30",
          type_operation: "Montage",
          commentaires: "RDV au portail",
        }),
      ],
      vehicules: VEHICULES,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(aoa[1][4]).toBe("5 rue Override");
    expect(aoa[1][6]).toBe("Montage");
    expect(aoa[1][7]).toBe("07:30");
    expect(aoa[1][11]).toBe("RDV au portail");
  });

  it("résout les ids véhicules en libellés (plan + réels)", () => {
    const aoa = buildFRTableurAOA({
      rows: [
        makeRow({
          vehicules_ids: ["v1", "v2"],
          vehicules_reels_ids: ["v1"],
          vehicules_discordance: true,
        }),
      ],
      vehicules: VEHICULES,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(aoa[1][8]).toBe("Camion A, Camion B");
    expect(aoa[1][9]).toBe("Camion A");
    expect(aoa[1][10]).toBe("⚠️");
  });

  it("colonne discordance vide quand véhicules plan = réels", () => {
    const aoa = buildFRTableurAOA({
      rows: [
        makeRow({
          vehicules_ids: ["v1"],
          vehicules_reels_ids: ["v1"],
          vehicules_discordance: false,
        }),
      ],
      vehicules: VEHICULES,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(aoa[1][10]).toBe("");
  });

  it("typologie future prioritaire sur typologie courante", () => {
    const aoa = buildFRTableurAOA({
      rows: [
        makeRow({
          typologie_courante: "prototype",
          typologie_future: "fabrication",
        }),
      ],
      vehicules: VEHICULES,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-01"),
    });
    // libellé fabrication ≠ prototype
    expect(aoa[1][2]).not.toBe("");
    expect(aoa[1][2]).not.toMatch(/proto/i);
  });

  it("fallback adresse_affichee = lieu de l'affaire si pas d'override", () => {
    const aoa = buildFRTableurAOA({
      rows: [makeRow({ adresse_override: null, adresse_affichee: "10 rue Default" })],
      vehicules: VEHICULES,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(aoa[1][4]).toBe("10 rue Default");
  });

  it("véhicule inconnu → fallback id court", () => {
    const aoa = buildFRTableurAOA({
      rows: [makeRow({ vehicules_ids: ["abcdefghij"] })],
      vehicules: [],
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(aoa[1][8]).toBe("abcdef");
  });

  it("plusieurs lignes : ordre préservé (déjà trié côté hook)", () => {
    const aoa = buildFRTableurAOA({
      rows: [
        makeRow({ id: "2026-05-01|a", affaire_numero: "4001" }),
        makeRow({ id: "2026-05-02|b", date: "2026-05-02", affaire_numero: "4002" }),
      ],
      vehicules: VEHICULES,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-02"),
    });
    expect(aoa).toHaveLength(3);
    expect(aoa[1][1]).toBe("4001");
    expect(aoa[2][1]).toBe("4002");
  });
});

describe("buildFRTableurWorkbook", () => {
  it("nom de fichier basé sur la période", () => {
    const out = buildFRTableurWorkbook({
      rows: [makeRow()],
      vehicules: VEHICULES,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-14"),
    });
    expect(out.filename).toBe(
      "feuille-route-tableur-2026-05-01_2026-05-14.xlsx",
    );
    expect(out.rowsCount).toBe(1);
  });

  it("workbook contient un sheet 'Feuille de route'", () => {
    const out = buildFRTableurWorkbook({
      rows: [makeRow()],
      vehicules: VEHICULES,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(out.wb.SheetNames).toContain("Feuille de route");
  });

  it("rowsCount = 0 si aucune donnée (header seul)", () => {
    const out = buildFRTableurWorkbook({
      rows: [],
      vehicules: VEHICULES,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-01"),
    });
    expect(out.rowsCount).toBe(0);
  });
});
