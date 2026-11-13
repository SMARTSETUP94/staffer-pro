import { describe, it, expect } from "vitest";
import { trierRacines, sansNumeroSaisi } from "../arbre";
import { lignesTableau, optionsDevis, totalAffiche, titreCourt, type DevisClient } from "../pdf-client";

const L = (id: string, type: string, ordre: number, libelle: string, parent_id: string | null = null, extra: any = {}) =>
  ({ id, parent_id, type, ordre, libelle, quantite: 1, montant: null, sous_total: null, descriptif_client: null, texte: null, finition: null, longueur_mm: null, largeur_mm: null, hauteur_mm: null, option_incluse: false, ...extra });

const lignes = [
  L("z1", "zone", 10, "1 – ENTRANCE"), L("cs", "chapitre_suivi", 20, "Suivi et plans", null, { montant: 500 }),
  L("cp", "chapitre_pose", 30, "Pose", null, { montant: 800 }), L("cd", "chapitre_depose", 40, "Dépose", null, { montant: 300 }),
  L("z2", "zone", 41, "2 – CORRIDOR"), L("z3", "zone", 42, "3 – ATRIUM"), L("z4", "zone", 43, "4 – INLINE (R+2)"), L("z5", "zone", 44, "5 – CATERING"),
  L("o1", "objet", 1, "Totem", "z4", { montant: 1000 }),
  L("st", "option", 2, "6 stèles", "z4", { montant: 600, option_incluse: true }),
  L("on4", "option", 3, "Option inline", "z4", { montant: 50 }),
  L("on1", "option", 9, "Option entrance", "z1", { montant: 10 }),
  L("on2", "option", 1, "Option corridor", "z2", { montant: 20 }),
];
const vc = { numero: "9516-R1", lignes, photos: [] } as unknown as DevisClient;

describe("structure PDF 9516-R1", () => {
  it("zones dans leur ordre puis suivi, pose, dépose", () => {
    expect(trierRacines(lignes.filter((l) => !l.parent_id)).map((l) => l.id)).toEqual(["z1", "z2", "z3", "z4", "z5", "cs", "cp", "cd"]);
  });
  it("le numéro saisi n'est pas doublé", () => {
    expect(sansNumeroSaisi("2 – CORRIDOR")).toBe("CORRIDOR");
    expect(titreCourt(lignes[4])).toBe("CORRIDOR");
  });
  it("option incluse = ligne normale de sa zone ; sous-total = somme des lignes", () => {
    const rows = lignesTableau(vc, lignes[7], "detaille", "4");
    expect(rows.map((r) => [r.n, r.designation])).toEqual([["4.1", "Totem"], ["4.2", "6 stèles"]]);
    expect(totalAffiche(vc, lignes[7])).toBe(1600);
  });
  it("options non incluses triées par zone, incluses absentes", () => {
    expect(optionsDevis(vc).map((o) => o.ligne.id)).toEqual(["on1", "on2", "on4"]);
    expect(optionsDevis(vc)[1].zone).toBe("CORRIDOR");
  });
  it("chapitre : libellé saisi", () => {
    expect(titreCourt(lignes[2])).toBe("Pose");
  });
});
