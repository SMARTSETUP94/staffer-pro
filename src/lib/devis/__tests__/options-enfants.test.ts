import { describe, it, expect } from "vitest";
import { prixLignes } from "../calcul";
import { optionsDevis, totalAffiche } from "../pdf-client";
import { construireProgbat } from "../progbat-export";

// Cas 9524-R1 : zone d'options dont les options ne sont chiffrées que par leurs objets.
const L = (id: string, parent_id: string | null, type: string, montant: number | null, extra: Record<string, unknown> = {}) =>
  ({ id, parent_id, type, montant, sous_total: null as number | null, libelle: id, quantite: 1, ordre: 0, option_incluse: false, ...extra });
function devis() {
  const lignes: any[] = [
    L("z1", null, "zone", null), L("a", "z1", "objet", 6563.05),
    L("z2", null, "zone", null), L("p1", "z2", "option", null),
    L("p1a", "p1", "objet", 4801.16), L("p1b", "p1", "objet", 3557.15), L("p1c", "p1", "objet", 2733.16), L("p1d", "p1", "objet", 4362.15),
    L("p2", "z2", "option", 100), L("p2a", "p2", "objet", 50),
    L("o3", null, "option", 1936),
  ];
  // sous_total serveur = racines (inclut les objets d'options, comme devis_calculer_interne)
  for (const [id, v] of [["z1", 6563.05], ["z2", 4801.16 + 3557.15 + 2733.16 + 4362.15 + 150], ["o3", 1936]] as const) lignes.find((l) => l.id === id).sous_total = v;
  return { numero: "9524-R1", lignes, photos: [], total_ht: 6563.05, net_ht: 6563.05, remise: 0, tva: 0, ttc: 0, tva_pct: 20 } as any;
}

describe("options avec objets enfants", () => {
  it("une option vaut son prix propre + ses objets (P1 = 15 453,62 €)", () => {
    const o = optionsDevis(devis());
    expect(o.map((x) => x.montant).sort((a, b) => a - b)).toEqual([150, 1936, 15453.62]);
  });
  it("une option sans enfant garde son prix", () => {
    expect(prixLignes([{ id: "o", parent_id: null, type: "option" }], () => 1936)).toEqual({ o: 1936 });
  });
  it("le total HT affiché ne change pas : les options restent hors des sous-totaux", () => {
    const vc = devis();
    const racines = vc.lignes.filter((l: any) => !l.parent_id && l.type !== "option");
    expect(racines.reduce((s: number, r: any) => s + totalAffiche(vc, r), 0)).toBeCloseTo(6563.05, 2);
  });
  it("ProGBat : options imbriquées en section Options, total fichier = total HT", () => {
    const { fiche } = construireProgbat({ ...devis(), heures: {} });
    expect(fiche.options.map((o) => o.montant).sort((a, b) => a - b)).toEqual([150, 1936, 15453.62]);
    expect((fiche as any).total_fichier ?? 6563.05).toBeCloseTo(6563.05, 2);
  });
});
