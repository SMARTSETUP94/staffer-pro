/**
 * v0.33 — Tests Vitest pour les helpers Vue Tableur Feuille de Route.
 */
import { describe, it, expect } from "vitest";
import {
  buildDateWindow,
  isAffaireActive,
  buildFRTableurRows,
  applyFRTableurFilters,
  fuzzySearchFR,
  mergeFRRowOverlay,
  isValidHoraire,
  buildUpsertPatch,
  normalizeHoraire,
  sameSet,
  type FRTableurRow,
  type FRTableurAffaire,
} from "@/lib/feuille-route-tableur-helpers";
import type {
  AssignationForResponsable,
  EmployeForResponsable,
} from "@/lib/feuille-route-helpers";

const aff = (
  partial: Partial<FRTableurAffaire> & { id: string; numero: string; nom: string },
): FRTableurAffaire => ({
  lieu: null,
  statut: "en_cours",
  chef_projet_id: null,
  charge_affaires_id: null,
  typologie_future: null,
  ...partial,
});

describe("buildDateWindow", () => {
  it("génère 14 dates ISO consécutives", () => {
    const dates = buildDateWindow(new Date("2026-01-05T00:00:00Z"), 14);
    expect(dates.length).toBe(14);
    expect(dates[0]).toBe("2026-01-05");
    expect(dates[13]).toBe("2026-01-18");
  });

  it("génère 1 seule date si nbDays=1", () => {
    const dates = buildDateWindow(new Date("2026-01-05T12:00:00Z"), 1);
    expect(dates).toEqual(["2026-01-05"]);
  });
});

describe("isAffaireActive", () => {
  it("retourne true pour en_cours et prospect", () => {
    expect(isAffaireActive("en_cours")).toBe(true);
    expect(isAffaireActive("prospect")).toBe(true);
  });
  it("retourne false pour termine et annule", () => {
    expect(isAffaireActive("termine")).toBe(false);
    expect(isAffaireActive("annule")).toBe(false);
  });
});

describe("normalizeHoraire", () => {
  it("réduit HH:MM:SS à HH:MM", () => {
    expect(normalizeHoraire("08:30:00")).toBe("08:30");
  });
  it("conserve HH:MM tel quel", () => {
    expect(normalizeHoraire("14:15")).toBe("14:15");
  });
  it("retourne null pour null", () => {
    expect(normalizeHoraire(null)).toBeNull();
  });
});

describe("sameSet", () => {
  it("true quand mêmes éléments", () => {
    expect(sameSet(["a", "b"], new Set(["b", "a"]))).toBe(true);
  });
  it("false quand cardinalité différente", () => {
    expect(sameSet(["a"], new Set(["a", "b"]))).toBe(false);
  });
  it("false quand un élément diffère", () => {
    expect(sameSet(["a", "c"], new Set(["a", "b"]))).toBe(false);
  });
  it("true pour deux vides", () => {
    expect(sameSet([], new Set())).toBe(true);
  });
});

describe("buildFRTableurRows", () => {
  const dates = ["2026-01-05", "2026-01-06"];
  const employesParId = new Map<string, EmployeForResponsable>([
    ["e1", { id: "e1", profile_id: "p1", est_manutention: false }],
  ]);

  it("exclut les affaires terminées/annulées", () => {
    const rows = buildFRTableurRows({
      dates,
      affaires: [
        aff({ id: "a1", numero: "5001", nom: "Chantier A", statut: "termine" }),
        aff({ id: "a2", numero: "5002", nom: "Chantier B", statut: "annule" }),
      ],
      assignations: [
        { affaire_id: "a1", date: "2026-01-05", employe_id: "e1", est_chef_jour: false },
      ],
      overrides: [],
      trajets: [],
      employes: [{ id: "e1", prenom: "Jean", nom: "DUPONT" }],
      employesParId,
      profiles: new Map(),
    });
    expect(rows).toHaveLength(0);
  });

  it("crée une ligne quand staffé même sans override", () => {
    const rows = buildFRTableurRows({
      dates,
      affaires: [aff({ id: "a1", numero: "5001", nom: "Chantier A" })],
      assignations: [
        { affaire_id: "a1", date: "2026-01-05", employe_id: "e1", est_chef_jour: true },
      ],
      overrides: [],
      trajets: [],
      employes: [{ id: "e1", prenom: "Jean", nom: "DUPONT" }],
      employesParId,
      profiles: new Map(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("2026-01-05|a1");
    expect(rows[0].staffe).toBe(true);
    expect(rows[0].responsable_id).toBe("e1");
    expect(rows[0].responsable_source).toBe("chef_du_jour");
  });

  it("crée une ligne fantôme si override existe sans staffing", () => {
    const rows = buildFRTableurRows({
      dates,
      affaires: [aff({ id: "a1", numero: "5001", nom: "Chantier A" })],
      assignations: [],
      overrides: [
        {
          id: "o1",
          date: "2026-01-06",
          affaire_id: "a1",
          type_operation: "Montage",
          horaire_rdv: "08:00:00",
          adresse_override: null,
          commentaires: null,
          vehicules_ids: [],
        },
      ],
      trajets: [],
      employes: [],
      employesParId,
      profiles: new Map(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].staffe).toBe(false);
    expect(rows[0].type_operation).toBe("Montage");
    expect(rows[0].horaire_rdv).toBe("08:00");
  });

  it("merge override sur l'adresse affichée", () => {
    const rows = buildFRTableurRows({
      dates: ["2026-01-05"],
      affaires: [aff({ id: "a1", numero: "5001", nom: "C", lieu: "Paris Expo" })],
      assignations: [
        { affaire_id: "a1", date: "2026-01-05", employe_id: "e1", est_chef_jour: false },
      ],
      overrides: [
        {
          id: "o1",
          date: "2026-01-05",
          affaire_id: "a1",
          type_operation: null,
          horaire_rdv: null,
          adresse_override: "Hall 7 — entrée B",
          commentaires: null,
          vehicules_ids: [],
        },
      ],
      trajets: [],
      employes: [{ id: "e1", prenom: "J", nom: "D" }],
      employesParId,
      profiles: new Map(),
    });
    expect(rows[0].adresse_affichee).toBe("Hall 7 — entrée B");
    expect(rows[0].adresse_override).toBe("Hall 7 — entrée B");
  });

  it("détecte la discordance véhicules plan vs réels", () => {
    const rows = buildFRTableurRows({
      dates: ["2026-01-05"],
      affaires: [aff({ id: "a1", numero: "5001", nom: "C" })],
      assignations: [
        { affaire_id: "a1", date: "2026-01-05", employe_id: "e1", est_chef_jour: false },
      ],
      overrides: [
        {
          id: "o1",
          date: "2026-01-05",
          affaire_id: "a1",
          type_operation: null,
          horaire_rdv: null,
          adresse_override: null,
          commentaires: null,
          vehicules_ids: ["v1"],
        },
      ],
      trajets: [{ date: "2026-01-05", affaire_id: "a1", vehicule_id: "v2" }],
      employes: [{ id: "e1", prenom: "J", nom: "D" }],
      employesParId,
      profiles: new Map(),
    });
    expect(rows[0].vehicules_discordance).toBe(true);
    expect(rows[0].vehicules_ids).toEqual(["v1"]);
    expect(rows[0].vehicules_reels_ids).toEqual(["v2"]);
  });

  it("trie par date puis par numero localisé", () => {
    const rows = buildFRTableurRows({
      dates,
      affaires: [
        aff({ id: "b", numero: "5010", nom: "B" }),
        aff({ id: "a", numero: "5002", nom: "A" }),
      ],
      assignations: [
        { affaire_id: "a", date: "2026-01-06", employe_id: "e1", est_chef_jour: false },
        { affaire_id: "b", date: "2026-01-05", employe_id: "e1", est_chef_jour: false },
        { affaire_id: "a", date: "2026-01-05", employe_id: "e1", est_chef_jour: false },
      ],
      overrides: [],
      trajets: [],
      employes: [{ id: "e1", prenom: "J", nom: "D" }],
      employesParId,
      profiles: new Map(),
    });
    expect(rows.map((r) => r.id)).toEqual([
      "2026-01-05|a",
      "2026-01-05|b",
      "2026-01-06|a",
    ]);
  });
});

describe("applyFRTableurFilters / fuzzySearchFR", () => {
  const baseRow: FRTableurRow = {
    id: "2026-01-05|a1",
    overrideId: null,
    date: "2026-01-05",
    affaire_id: "a1",
    affaire_numero: "5001",
    affaire_nom: "Salon Maison&Objet",
    affaire_lieu: "Paris Nord Villepinte",
    typologie_courante: "fabrication",
    typologie_future: null,
    type_operation: "Montage",
    horaire_rdv: "08:00",
    adresse_override: null,
    adresse_affichee: "Paris Nord Villepinte",
    commentaires: null,
    vehicules_ids: [],
    vehicules_reels_ids: [],
    vehicules_discordance: false,
    responsable_id: null,
    responsable_label: "Dupont Jean",
    responsable_source: "chef_projet",
    staffe: true,
  };

  it("recherche fuzzy insensible accents/casse", () => {
    expect(fuzzySearchFR(baseRow, "MAISON OBJET")).toBe(true);
    expect(fuzzySearchFR(baseRow, "villepinte")).toBe(true);
    expect(fuzzySearchFR(baseRow, "5001 dupont")).toBe(true);
    expect(fuzzySearchFR(baseRow, "absent")).toBe(false);
  });

  it("filtre typologies (fallback courante si pas de future)", () => {
    const out = applyFRTableurFilters([baseRow], {
      search: "",
      typologies: ["fabrication"],
      affaireIds: null,
    });
    expect(out).toHaveLength(1);
    const out2 = applyFRTableurFilters([baseRow], {
      search: "",
      typologies: ["stockage"],
      affaireIds: null,
    });
    expect(out2).toHaveLength(0);
  });

  it("typologie_future override la typologie_courante pour le filtre", () => {
    const r = { ...baseRow, typologie_future: "stockage" as const };
    const out = applyFRTableurFilters([r], {
      search: "",
      typologies: ["stockage"],
      affaireIds: null,
    });
    expect(out).toHaveLength(1);
  });

  it("filtre affaireIds restrictif", () => {
    const out = applyFRTableurFilters([baseRow], {
      search: "",
      typologies: [],
      affaireIds: new Set(["other"]),
    });
    expect(out).toHaveLength(0);
  });
});

describe("mergeFRRowOverlay", () => {
  const row: FRTableurRow = {
    id: "k",
    overrideId: null,
    date: "2026-01-05",
    affaire_id: "a",
    affaire_numero: "5001",
    affaire_nom: "C",
    affaire_lieu: "Paris",
    typologie_courante: "fabrication",
    typologie_future: null,
    type_operation: null,
    horaire_rdv: null,
    adresse_override: null,
    adresse_affichee: "Paris",
    commentaires: null,
    vehicules_ids: [],
    vehicules_reels_ids: [],
    vehicules_discordance: false,
    responsable_id: null,
    responsable_label: "—",
    responsable_source: null,
    staffe: true,
  };

  it("renvoie row tel quel si overlay vide", () => {
    expect(mergeFRRowOverlay(row, undefined)).toBe(row);
    expect(mergeFRRowOverlay(row, {})).toBe(row);
  });

  it("applique le patch et recalcule adresse_affichee", () => {
    const merged = mergeFRRowOverlay(row, {
      type_operation: "Montage",
      adresse_override: "Hall A",
    });
    expect(merged.type_operation).toBe("Montage");
    expect(merged.adresse_override).toBe("Hall A");
    expect(merged.adresse_affichee).toBe("Hall A");
  });

  it("revient à affaire.lieu si adresse_override mise à null", () => {
    const merged = mergeFRRowOverlay(row, { adresse_override: null });
    expect(merged.adresse_affichee).toBe("Paris");
  });
});

describe("isValidHoraire", () => {
  it("accepte HH:MM valides 24h", () => {
    expect(isValidHoraire("00:00")).toBe(true);
    expect(isValidHoraire("08:30")).toBe(true);
    expect(isValidHoraire("23:59")).toBe(true);
  });
  it("accepte chaîne vide (effacement)", () => {
    expect(isValidHoraire("")).toBe(true);
  });
  it("refuse formats invalides", () => {
    expect(isValidHoraire("24:00")).toBe(false);
    expect(isValidHoraire("8:00")).toBe(false);
    expect(isValidHoraire("08:60")).toBe(false);
    expect(isValidHoraire("abc")).toBe(false);
  });
});

describe("buildUpsertPatch", () => {
  it("ne propage que les clés présentes dans l'overlay", () => {
    const p = buildUpsertPatch({ type_operation: "Montage" });
    expect(p).toEqual({ type_operation: "Montage" });
    expect("horaire_rdv" in p).toBe(false);
  });
  it("convertit null en chaîne vide pour les texte (sentinel BDD)", () => {
    const p = buildUpsertPatch({ adresse_override: null });
    expect(p.adresse_override).toBe("");
  });
  it("array vide pour vehicules_ids null", () => {
    const p = buildUpsertPatch({ vehicules_ids: [] });
    expect(p.vehicules_ids).toEqual([]);
  });
});
