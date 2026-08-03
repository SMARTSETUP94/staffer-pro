import { describe, expect, it } from "vitest";
import {
  buildAffectationIndex, computeEcartEffectif, computeOccupation, detectAnomalies,
  filterPersonnes, groupByMetier, hasDoubleAffectation, slotsOverlap,
  type QuiAbsence, type QuiAffectation, type QuiMetier, type QuiPersonne,
} from "@/lib/qui-est-ou";

const metiers: QuiMetier[] = [
  { id: 1, libelle: "Construction", couleur: "#111", ordre: 1 },
  { id: 2, libelle: "Peinture", couleur: "#222", ordre: 2 },
];
const personnes: QuiPersonne[] = [
  { id: "p1", nom: "Durand", prenom: "Alice", metier_principal_id: 1 },
  { id: "p2", nom: "Bernard", prenom: "Bob", metier_principal_id: 2 },
];
const a = (o: Partial<QuiAffectation> & { id: string }): QuiAffectation => ({
  employe_id: "p1", affaire_id: "af1", date: "2026-06-01", demi_journee: "JOURNEE", ...o,
});

describe("slots", () => {
  it("JOURNEE recouvre tout", () => {
    expect(slotsOverlap("JOURNEE", "AM")).toBe(true);
    expect(slotsOverlap("AM", "PM")).toBe(false);
  });
});

describe("anomalies", () => {
  it("deux chantiers différents sur le même créneau = double", () => {
    expect(hasDoubleAffectation([a({ id: "1" }), a({ id: "2", affaire_id: "af2" })])).toBe(true);
  });
  it("AM + PM sur deux chantiers ≠ anomalie", () => {
    expect(
      hasDoubleAffectation([
        a({ id: "1", demi_journee: "AM" }),
        a({ id: "2", affaire_id: "af2", demi_journee: "PM" }),
      ]),
    ).toBe(false);
  });
  it("affecté alors qu'absent", () => {
    const abs: QuiAbsence[] = [
      { id: "x", employe_id: "p1", date_debut: "2026-06-01", date_fin: "2026-06-01", demi_journee: null, type: "conges" },
    ];
    const res = detectAnomalies(personnes, ["2026-06-01"], buildAffectationIndex([a({ id: "1" })]), abs);
    expect(res).toEqual([{ employe_id: "p1", date: "2026-06-01", type: "absent" }]);
  });
});

describe("occupation", () => {
  it("déduit les absences des jours ouvrables", () => {
    const abs: QuiAbsence[] = [
      { id: "x", employe_id: "p2", date_debut: "2026-06-01", date_fin: "2026-06-01", demi_journee: null, type: "rtt" },
    ];
    const k = computeOccupation(personnes, ["2026-06-01"], buildAffectationIndex([a({ id: "1" })]), abs);
    expect(k.joursOuvrables).toBe(1);
    expect(k.joursAffectes).toBe(1);
    expect(k.tauxOccupation).toBe(1);
    expect(k.personnesEnAbsence).toBe(1);
  });
  it("compte une demi-journée pour 0,5", () => {
    const k = computeOccupation(
      [personnes[0]!], ["2026-06-01"],
      buildAffectationIndex([a({ id: "1", demi_journee: "AM" })]), [],
    );
    expect(k.joursAffectes).toBe(0.5);
    expect(k.joursDisponibles).toBe(0.5);
  });
});

describe("écart effectif", () => {
  it("calcule le reste à pourvoir par métier", () => {
    const rows = computeEcartEffectif(
      [{ metier_id: 1, date: "2026-06-01", nb_pers: 3 }],
      personnes, [a({ id: "1" })], metiers,
    );
    expect(rows[0]).toMatchObject({ metier_id: 1, prevues: 3, nommees: 1, aPourvoir: 2 });
  });
});

describe("filtres & groupes", () => {
  const index = buildAffectationIndex([a({ id: "1" })]);
  const base = { metierIds: [], affaireIds: [], recherche: "", masquerSansAffectation: false, anomaliesSeulement: false };
  it("masque les personnes sans affectation", () => {
    const res = filterPersonnes(personnes, { ...base, masquerSansAffectation: true }, index, ["2026-06-01"], new Set());
    expect(res.map((p) => p.id)).toEqual(["p1"]);
  });
  it("recherche insensible aux accents", () => {
    expect(filterPersonnes(personnes, { ...base, recherche: "alicé" }, index, [], new Set())).toHaveLength(1);
    expect(filterPersonnes(personnes, { ...base, recherche: "ALICE" }, index, [], new Set())).toHaveLength(1);
  });
  it("groupe par métier dans l'ordre", () => {
    const g = groupByMetier(personnes, metiers);
    expect(g.map((x) => x.metier?.libelle)).toEqual(["Construction", "Peinture"]);
  });
});
