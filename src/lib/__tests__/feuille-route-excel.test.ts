import { describe, it, expect } from "vitest";
import { buildFeuilleRouteRows } from "../feuille-route-excel";

const affaires = [
  { id: "a1", numero: "5001", nom: "Stand Acme", lieu: "Paris Expo" },
  { id: "a2", numero: "5002", nom: "Booth Globex", lieu: null },
];
const employes = [
  { id: "e1", prenom: "Jean", nom: "Dupont" },
  { id: "e2", prenom: "Marie", nom: "Martin" },
];
const metiers = [
  { id: 1, libelle: "Construction" },
  { id: 2, libelle: "Métallerie" },
];

describe("buildFeuilleRouteRows", () => {
  it("structure : date_header + chantier_header + chantier_data + employes + spacer", () => {
    const dates = [new Date("2026-04-28T00:00:00Z")];
    const responsables = new Map([["a1|2026-04-28", "Jean DUPONT"]]);
    const rows = buildFeuilleRouteRows({
      dates,
      affaires,
      employes,
      metiers,
      assignations: [
        {
          affaire_id: "a1",
          date: "2026-04-28",
          employe_id: "e1",
          metier_id: 1,
          type_operation: "Montage",
        },
        {
          affaire_id: "a1",
          date: "2026-04-28",
          employe_id: "e2",
          metier_id: 2,
          type_operation: null,
        },
      ],
      responsables,
    });

    expect(rows[0].kind).toBe("date_header");
    expect(rows[1].kind).toBe("chantier_header");
    expect(rows[1].cells).toEqual([
      "Code",
      "Nom chantier",
      "Responsable",
      "Opération",
      "Adresse",
      "Commentaires",
    ]);
    expect(rows[2].kind).toBe("chantier_data");
    expect(rows[2].cells[0]).toBe("5001");
    expect(rows[2].cells[2]).toBe("Jean DUPONT");
    expect(rows[2].cells[3]).toBe("Montage");
    expect(rows[2].cells[4]).toBe("Paris Expo");

    // Employés en majuscule, triés par nom
    const empRows = rows.filter((r) => r.kind === "employe");
    expect(empRows).toHaveLength(2);
    expect(empRows[0].cells[1]).toBe("DUPONT Jean");
    expect(empRows[0].cells[2]).toBe("Construction");
    expect(empRows[1].cells[1]).toBe("MARTIN Marie");
  });

  it("affiche '—' si aucun chantier staffé un jour", () => {
    const rows = buildFeuilleRouteRows({
      dates: [new Date("2026-04-28")],
      affaires,
      employes,
      metiers,
      assignations: [],
      responsables: new Map(),
    });
    const dataRow = rows.find((r) => r.kind === "chantier_data");
    expect(dataRow?.cells[1]).toBe("Aucun chantier staffé");
  });

  it("agrège plusieurs opérations sur un même chantier en '/'", () => {
    const rows = buildFeuilleRouteRows({
      dates: [new Date("2026-04-28")],
      affaires,
      employes,
      metiers,
      assignations: [
        {
          affaire_id: "a1",
          date: "2026-04-28",
          employe_id: "e1",
          metier_id: 1,
          type_operation: "Montage",
        },
        {
          affaire_id: "a1",
          date: "2026-04-28",
          employe_id: "e2",
          metier_id: 2,
          type_operation: "Finition",
        },
      ],
      responsables: new Map(),
    });
    const dataRow = rows.find((r) => r.kind === "chantier_data");
    expect(dataRow?.cells[3]).toMatch(/Montage.*Finition|Finition.*Montage/);
  });

  it("gère plusieurs jours avec spacers", () => {
    const rows = buildFeuilleRouteRows({
      dates: [new Date("2026-04-28"), new Date("2026-04-29")],
      affaires,
      employes,
      metiers,
      assignations: [
        {
          affaire_id: "a1",
          date: "2026-04-28",
          employe_id: "e1",
          metier_id: 1,
          type_operation: null,
        },
        {
          affaire_id: "a2",
          date: "2026-04-29",
          employe_id: "e2",
          metier_id: 2,
          type_operation: null,
        },
      ],
      responsables: new Map(),
    });
    const headers = rows.filter((r) => r.kind === "date_header");
    expect(headers).toHaveLength(2);
  });
});
