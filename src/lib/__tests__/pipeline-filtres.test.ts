import { describe, it, expect } from "vitest";
import { FILTRES_VIDES, passeFiltres, nbFiltresAvances, bornesPeriode, statutDevisFiltre } from "../pipeline-filtres";

const now = new Date(2026, 10, 3);
const opp = { statut_opportunite: "envoye", client: "FIJI", date_montage: "2026-12-12", taille: "M", typologie_future: "fabrication" };

describe("filtres avancés du pipeline", () => {
  it("période mois prochain = décembre 2026", () => {
    expect(bornesPeriode({ periode: "mois_prochain", du: "", au: "" }, now)).toEqual(["2026-12-01", "2026-12-31"]);
    expect(passeFiltres(opp, undefined, { ...FILTRES_VIDES, periode: "ce_mois" }, now)).toBe(false);
    expect(passeFiltres(opp, undefined, { ...FILTRES_VIDES, periode: "mois_prochain" }, now)).toBe(true);
  });
  it("sans devis", () => {
    expect(statutDevisFiltre(undefined)).toBe("sans_devis");
    expect(passeFiltres(opp, { statut_redaction: "brouillon", montant: 10 }, { ...FILTRES_VIDES, statutsDevis: ["sans_devis"] }, now)).toBe(false);
  });
  it("montant minimum 9 000 € : 9 511 € passe, 5 000 € non", () => {
    const f = { ...FILTRES_VIDES, montantMin: 9000 };
    expect(passeFiltres(opp, { statut_redaction: "envoye", montant: 9511 }, f, now)).toBe(true);
    expect(passeFiltres(opp, { statut_redaction: "envoye", montant: 5000 }, f, now)).toBe(false);
  });
  it("sans date de montage exclut une opportunité datée", () => {
    expect(passeFiltres(opp, undefined, { ...FILTRES_VIDES, sansDateMontage: true }, now)).toBe(false);
  });
  it("compte les filtres actifs", () => {
    expect(nbFiltresAvances(FILTRES_VIDES)).toBe(0);
    expect(nbFiltresAvances({ ...FILTRES_VIDES, client: "fiji", enRetard: true })).toBe(2);
  });
});
