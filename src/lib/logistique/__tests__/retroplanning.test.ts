import { describe, expect, it } from "vitest";
import { completerRetroplanning, decalerJoursOuvres, type EtapeProposee } from "../retroplanning";

const e = (type: EtapeProposee["type"], date_debut: string, date_fin: string | null = null): EtapeProposee => ({
  type, date_debut, date_fin, heure_debut: null, heure_fin: null, lieu: null, note: null, origine: "jalonnement",
});

describe("rétroplanning logistique", () => {
  it("saute le week-end en reculant", () => {
    expect(decalerJoursOuvres("2026-10-19", -1)).toBe("2026-10-16"); // lundi → vendredi
  });
  it("saute un jour férié (11 novembre)", () => {
    expect(decalerJoursOuvres("2026-11-12", -1)).toBe("2026-11-10");
  });
  it("chargement = livraison − 1 j, emballage − 2 j, appro − 3 j", () => {
    const r = completerRetroplanning([e("livraison", "2026-10-21")]);
    const d = (t: string) => r.find((x) => x.type === t)?.date_debut;
    expect(d("chargement")).toBe("2026-10-20");
    expect(d("emballage")).toBe("2026-10-16");
    expect(d("appro")).toBe("2026-10-13");
  });
  it("déchargement = fin du démontage + 1 j ouvré", () => {
    const r = completerRetroplanning([e("demontage", "2026-10-22", "2026-10-23")]);
    expect(r.find((x) => x.type === "dechargement")?.date_debut).toBe("2026-10-26");
  });
  it("ne remplace pas une étape déjà lue dans le jalonnement", () => {
    const r = completerRetroplanning([e("livraison", "2026-10-21"), e("chargement", "2026-10-19")]);
    expect(r.filter((x) => x.type === "chargement")).toHaveLength(1);
    expect(r.find((x) => x.type === "emballage")?.date_debut).toBe("2026-10-15");
  });
});
