import { describe, it, expect } from "vitest";
import {
  calculerPeriodes, estOuvre, joursOuvresAvant, etatSignature, regrouperMateriaux,
  dureeFabricationSemaines, aDater, datePasseeAClore, lundi, type OppPlanning,
} from "../planning-previsionnel";

const base = (o: Partial<OppPlanning>): OppPlanning => ({
  affaire_id: "a", numero: "9000", nom: null, statut: "presque_gagne", taille: "moyen",
  date_montage: null, date_demontage: null, date_evenement_debut: null, date_evenement_fin: null,
  charge_affaires_id: null, charge_affaires_nom: null, client_nom: null, devis_id: null, montant_ht: null,
  heures_fabrication: 0, materiaux: [], autres_lignes: [], prochaine_action: null, ...o,
});
const mat = (q: number, id = "osb", unite = "m²") => ({ materiau_id: id, designation: "OSB 18", unite, fournisseur: null, quantite: q, prix_achat: 7 });

describe("jours ouvrés", () => {
  it("week-end non ouvré", () => { expect(estOuvre("2026-12-12")).toBe(false); expect(estOuvre("2026-12-11")).toBe(true); });
  it("fermeture 24/12 → 01/01 exclue", () => {
    expect(estOuvre("2026-12-24")).toBe(false);
    expect(estOuvre("2027-01-01")).toBe(false);
    expect(estOuvre("2026-12-23")).toBe(true);
    expect(estOuvre("2027-01-04")).toBe(true);
  });
  it("5 jours ouvrés avant le lundi 04/01/2027 sautent la fermeture", () => {
    expect(joursOuvresAvant("2027-01-04", 5)).toBe("2026-12-17");
  });
});

describe("durée de fabrication", () => {
  it("heures ÷ (4 × 35 h), semaine supérieure", () => expect(dureeFabricationSemaines({ heures_fabrication: 815, taille: null }).semaines).toBe(6));
  it("minimum 1 semaine", () => expect(dureeFabricationSemaines({ heures_fabrication: 3, taille: null }).semaines).toBe(1));
  it("sans heures : selon la taille", () => {
    expect(dureeFabricationSemaines({ heures_fabrication: 0, taille: "tres_petit" }).semaines).toBe(1);
    expect(dureeFabricationSemaines({ heures_fabrication: 0, taille: "gros" }).semaines).toBe(6);
    expect(dureeFabricationSemaines({ heures_fabrication: 0, taille: "tres_gros" }).semaines).toBe(8);
  });
  it("taille vide : 4 semaines, signalée", () => {
    expect(dureeFabricationSemaines({ heures_fabrication: 0, taille: null })).toEqual({ semaines: 4, source: "taille_vide" });
  });
});

describe("périodes à rebours", () => {
  // Cas maquette 9516 : montage 16/01, fabrication 5 semaines.
  const o = base({ date_montage: "2027-01-16", date_demontage: "2027-01-24", heures_fabrication: 700, materiaux: [mat(1)] });
  const p = calculerPeriodes(o)!;
  it("fabrication 12/12 → 15/01", () => expect(p.fabrication).toMatchObject({ debut: "2026-12-12", fin: "2027-01-15", semaines: 5 }));
  it("échantillons : 5 jours ouvrés juste avant", () => expect(p.echantillons).toEqual({ debut: "2026-12-07", fin: "2026-12-11" }));
  it("limite de signature = début des échantillons", () => expect(p.limiteSignature).toBe("2026-12-07"));
  it("commande 3 jours calendaires avant la fabrication", () => expect(p.commande).toBe("2026-12-09"));
  it("période client montage → démontage", () => expect(p.client).toEqual({ debut: "2027-01-16", fin: "2027-01-24" }));
  it("pas de commande sans matière", () => expect(calculerPeriodes({ ...o, materiaux: [] })!.commande).toBeNull());
  it("à défaut, date d'événement", () => expect(calculerPeriodes(base({ date_evenement_debut: "2027-02-01" }))!.client.debut).toBe("2027-02-01"));
});

describe("limite de signature", () => {
  it("dépassée", () => expect(etatSignature("2026-11-03", "2026-11-14")).toMatchObject({ niveau: "hors_delai", jours: 11, libelle: "Signature hors délai (11 j)" }));
  it("≤ 7 jours", () => expect(etatSignature("2026-11-21", "2026-11-14").niveau).toBe("proche"));
  it("au-delà", () => expect(etatSignature("2026-11-22", "2026-11-14")).toMatchObject({ niveau: "ok", libelle: "À signer d'ici le 22/11" }));
});

describe("blocs", () => {
  it("à dater", () => expect(aDater([base({}), base({ affaire_id: "b", date_montage: "2027-01-01" })]).map((o) => o.affaire_id)).toEqual(["a"]));
  it("date passée", () => expect(datePasseeAClore([base({ date_montage: "2026-11-01" })], "2026-11-14")).toHaveLength(1));
});

describe("matériaux à commander", () => {
  const o1 = base({ affaire_id: "1", numero: "9516", date_montage: "2027-01-16", heures_fabrication: 700, materiaux: [mat(300), mat(200)] });
  const o2 = base({ affaire_id: "2", numero: "9520", statut: "a_faire", date_montage: "2027-01-16", heures_fabrication: 700, materiaux: [mat(50)] });
  const o3 = base({ affaire_id: "3", numero: "9521", date_montage: "2027-01-16", heures_fabrication: 700, materiaux: [mat(10, "osb", "panneau")] });
  it("regroupe même matériau et même unité, semaine = lundi de la commande", () => {
    const r = regrouperMateriaux([o1, o2, o3], undefined, { statuts: ["presque_gagne"] });
    const osb = r.lignes.find((l) => l.unite === "m²")!;
    expect(osb.total).toBe(500);
    expect(Object.keys(osb.parSemaine)).toEqual(["2026-12-07"]);
    expect(osb.numeros).toEqual(["9516"]);
    expect(r.lignes).toHaveLength(2);
    expect(lundi("2026-12-09")).toBe("2026-12-07");
  });
  it("quantités non pondérées, filtre par probabilité", () => {
    const r = regrouperMateriaux([o1, o2], undefined, { statuts: ["presque_gagne", "a_faire"] });
    expect(r.lignes[0].total).toBe(550);
  });
  it("opportunité sélectionnée seule", () => {
    expect(regrouperMateriaux([o1, o2], undefined, { statuts: ["presque_gagne", "a_faire"], affaireId: "2" }).lignes[0].total).toBe(50);
  });
  it("sans prix (droit coûts absent) : achat masqué", () => {
    const r = regrouperMateriaux([base({ ...o1, materiaux: [{ ...mat(5), prix_achat: null }] })], undefined, { statuts: ["presque_gagne"] });
    expect(r.lignes[0].achatHT).toBeNull();
  });
  it("à défaut d'identifiant, même désignation et unité", () => {
    const a = { materiau_id: null, designation: "Tasseau  Sapin", unite: "ml", fournisseur: null, quantite: 2, prix_achat: null };
    const r = regrouperMateriaux([base({ ...o1, materiaux: [a, { ...a, designation: "tasseau sapin" }] })], undefined, { statuts: ["presque_gagne"] });
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0].total).toBe(4);
  });
});
