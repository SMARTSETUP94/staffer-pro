import { describe, it, expect } from "vitest";
import { filterTrajets, computeFlotteStats, type Trajet, type Vehicule } from "../trajets-stats";

function mkT(o: Partial<Trajet>): Trajet {
  return {
    id: o.id ?? crypto.randomUUID(),
    date: o.date ?? "2026-01-15",
    adresse_depart: o.adresse_depart ?? "Paris",
    adresse_arrivee: o.adresse_arrivee ?? "Lyon",
    adresse_depart_favorite_id: null,
    adresse_arrivee_favorite_id: null,
    affaire_id: o.affaire_id ?? null,
    aller_retour: false,
    categorie: o.categorie ?? "pose",
    chauffeur_id: null,
    created_at: "2026-01-01",
    created_by: null,
    heure_arrivee: null,
    heure_depart: null,
    kilometrage: o.kilometrage ?? 100,
    notes: o.notes ?? null,
    parent_trajet_id: null,
    prestataire: o.prestataire ?? null,
    reference: o.reference ?? null,
    soustraitance_envoye_le: null,
    statut_soustraitance: o.statut_soustraitance ?? "non",
    updated_at: "2026-01-01",
    vehicule_id: o.vehicule_id ?? null,
  };
}

const veh: Vehicule[] = [
  { id: "v1", nom: "Renault Master" } as Vehicule,
  { id: "v2", nom: "Iveco Daily" } as Vehicule,
];

describe("filterTrajets", () => {
  const data = [
    mkT({ id: "a", date: "2026-01-01", vehicule_id: "v1", statut_soustraitance: "confirme", prestataire: "TransportCo" }),
    mkT({ id: "b", date: "2026-02-01", vehicule_id: "v2", statut_soustraitance: "non", categorie: "depose" }),
    mkT({ id: "c", date: "2026-03-01", prestataire: "Logistics SARL", statut_soustraitance: "a_sous_traiter" }),
  ];

  it("filtre par range de dates", () => {
    expect(filterTrajets(data, { dateFrom: "2026-02-01" }).map((t) => t.id)).toEqual(["b", "c"]);
    expect(filterTrajets(data, { dateTo: "2026-01-31" }).map((t) => t.id)).toEqual(["a"]);
  });

  it("filtre par véhicule", () => {
    expect(filterTrajets(data, { vehiculeId: "v1" }).map((t) => t.id)).toEqual(["a"]);
  });

  it("filtre par statut + catégorie", () => {
    expect(filterTrajets(data, { statut: "non" }).map((t) => t.id)).toEqual(["b"]);
    expect(filterTrajets(data, { categorie: "depose" }).map((t) => t.id)).toEqual(["b"]);
  });

  it("filtre par prestataire (partial, case-insensitive)", () => {
    expect(filterTrajets(data, { prestataire: "transport" }).map((t) => t.id)).toEqual(["a"]);
    expect(filterTrajets(data, { prestataire: "LOGISTICS" }).map((t) => t.id)).toEqual(["c"]);
  });

  it("recherche libre sur adresses", () => {
    expect(filterTrajets(data, { query: "lyon" }).length).toBe(3);
  });
});

describe("computeFlotteStats", () => {
  const trajets = [
    mkT({ vehicule_id: "v1", kilometrage: 100, statut_soustraitance: "non" }),
    mkT({ vehicule_id: "v1", kilometrage: 200, statut_soustraitance: "confirme", prestataire: "TransportCo" }),
    mkT({ vehicule_id: "v2", kilometrage: 50, statut_soustraitance: "a_sous_traiter", prestataire: "TransportCo", categorie: "depose" }),
    mkT({ vehicule_id: null, kilometrage: 300, statut_soustraitance: "confirme", prestataire: "AutreTransport" }),
  ];

  it("calcule totaux", () => {
    const s = computeFlotteStats(trajets, veh);
    expect(s.totalTrajets).toBe(4);
    expect(s.totalKm).toBe(650);
    expect(s.totalSousTraites).toBe(3);
    expect(s.totalConfirmes).toBe(2);
  });

  it("agrège top transporteurs (tri décroissant)", () => {
    const s = computeFlotteStats(trajets, veh);
    expect(s.topTransporteurs[0].prestataire).toBe("TransportCo");
    expect(s.topTransporteurs[0].count).toBe(2);
    expect(s.topTransporteurs[0].km).toBe(250);
  });

  it("agrège par véhicule (km décroissant)", () => {
    const s = computeFlotteStats(trajets, veh);
    expect(s.parVehicule[0].vehiculeId).toBe("v1");
    expect(s.parVehicule[0].km).toBe(300);
  });

  it("calcule € engagés via tarifs prestataires", () => {
    const tarifs = new Map([["transportco", 1.5], ["autretransport", 2]]);
    const s = computeFlotteStats(trajets, veh, tarifs);
    // Confirmés uniquement : v1=200km×1.5 + null=300km×2 = 300+600 = 900
    expect(s.totalEurEngages).toBe(900);
  });

  it("renvoie 0 € si aucun tarif disponible", () => {
    const s = computeFlotteStats(trajets, veh);
    expect(s.totalEurEngages).toBe(0);
  });

  it("filtre catégories vides", () => {
    const s = computeFlotteStats(trajets, veh);
    const cats = s.parCategorie.map((c) => c.categorie);
    expect(cats).toContain("pose");
    expect(cats).toContain("depose");
    expect(cats).not.toContain("autre");
  });
});
