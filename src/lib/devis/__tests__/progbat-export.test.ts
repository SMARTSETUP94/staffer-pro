import { describe, expect, it } from "vitest";
import data from "./fixtures/progbat-3-devis.json";
import { calculerDevis, type CalcHeure, type CalcLibre, type CalcLigne } from "../calcul";
import { cellulesProgbat, CONSIGNES_PROGBAT, construireProgbat, ecartTransfert, estNumeroProgbatValide, libelleNumeroProgbat, libelleStatutDevis, NUMERO_PROGBAT_RE, type DonneesProgbat } from "../progbat-export";
import type { LigneClient } from "../pdf-client";

const L = (p: Partial<LigneClient> & { id: string; type: string }): LigneClient => ({
  parent_id: null, ordre: 0, libelle: null, quantite: 1, descriptif_client: null, longueur_mm: null, largeur_mm: null, hauteur_mm: null,
  finition: null, texte: null, option_incluse: null, montant: null, sous_total: null, ...p,
});
const base = (lignes: LigneClient[], total: number, extra: Partial<DonneesProgbat> = {}): DonneesProgbat => ({
  id: "d1", numero: "9484-R2", version: 2, statut_redaction: "valide", libelle: "FIJI", date_devis: null, validite_jours: 30,
  client: { nom: "FIJI Water", adresse: null, code_postal: null, ville: null }, client_final: null, contact: { nom: "Marie", email: "m@x.fr" },
  dates: {}, lignes, photos: [], total_ht: total, net_ht: total, remise: 0, tva: 0, tva_pct: 20, ttc: 0, heures: {}, ...extra,
});
const sommeLignes = (r: ReturnType<typeof construireProgbat>) =>
  r.lignes.reduce((s, l) => s + (l.kind === "ligne" && (!l.option || r.fiche.options.find((o) => o.n === l.n)?.incluse) ? Math.round(l.quantite * Math.round(l.pu * 100)) : 0), 0) / 100;

describe("Export ProGBat — arrondis", () => {
  const lignes = [
    L({ id: "z", type: "zone", libelle: "Stand", ordre: 1 }),
    L({ id: "o", type: "objet", parent_id: "z", libelle: "Lame", quantite: 18, montant: 5757.86, longueur_mm: 2000, largeur_mm: 300, descriptif_client: "Lame laquée" }),
    L({ id: "s", type: "chapitre_suivi", libelle: "Suivi et plans", ordre: 2, montant: 1000 }),
  ];
  it("18 × 319,88 : l'écart de 0,02 € est absorbé dans la ligne « 1 ens » de Suivi et plans, sans ligne visible", () => {
    const r = construireProgbat(base(lignes, 6757.86, { heures: { o: 36, s: 10 } }));
    const lame = r.lignes.find((l) => l.kind === "ligne" && l.designation === "Lame");
    expect(lame).toMatchObject({ n: "1.1", quantite: 18, unite: "u", pu: 319.88, temps: 36 });
    expect(r.lignes.find((l) => l.kind === "ligne" && l.n === "2.1")).toMatchObject({ unite: "ens", quantite: 1, pu: 1000.02, temps: 10 });
    expect(r.lignes.some((l) => l.kind === "ligne" && /Ajustement/.test(l.designation))).toBe(false);
    expect(r.fiche.ajustement_arrondi).toEqual({ montant: 0.02, n: "2.1", designation: "Études et suivi de projet", mode: "absorbe" });
    expect(r.fiche.total_fichier).toBe(6757.86);
    expect(r.fiche.controle_ok).toBe(true);
  });
  it("sans Suivi et plans, l'écart va dans Pose avant Dépose", () => {
    const ls = [lignes[0], lignes[1], L({ id: "d", type: "chapitre_depose", ordre: 4, montant: 50 }), L({ id: "p", type: "chapitre_pose", ordre: 3, montant: 200 })];
    const r = construireProgbat(base(ls, 6007.86));
    expect(r.fiche.ajustement_arrondi).toMatchObject({ designation: "Pose et mise en place", montant: 0.02 });
    expect(r.fiche.controle_ok).toBe(true);
  });
  it("sans chapitre forfaitaire, une ligne d'ajustement est ajoutée à la fin de la dernière zone", () => {
    const r = construireProgbat(base(lignes.slice(0, 2), 5757.86));
    expect(r.lignes.find((l) => l.kind === "ligne" && l.n === "1.2")).toMatchObject({ designation: "Ajustement d'arrondi", pu: 0.02 });
    expect(r.fiche.ajustement_arrondi?.mode).toBe("ligne");
    expect(r.fiche.total_fichier).toBe(5757.86);
  });
  it("dimensions en tête des commentaires, puis descriptif ; titres et commentaires sans quantité", () => {
    const cells = cellulesProgbat(construireProgbat(base(lignes, 6757.86)).lignes);
    expect(cells[0]).toEqual(["N°", "Désignation", "Quantité", "Unité", "Prix unitaire", "Temps prévu"]);
    expect(cells[1]).toEqual(["1", "Stand", null, null, null, null]);
    expect(cells[3]).toEqual([null, "2000 × 300 mm", null, null, null, null]);
    expect(cells[4]).toEqual([null, "Lame laquée", null, null, null, null]);
  });
});

describe("Export ProGBat — options, remise et données interdites", () => {
  it("options en fin de fichier, incluse comptée dans le total, non incluse marquée hors total ; remise seulement dans la fiche", () => {
    const ls = [
      L({ id: "z", type: "zone", libelle: "Zone", ordre: 1 }), L({ id: "o", type: "objet", parent_id: "z", libelle: "Table", montant: 1000 }),
      L({ id: "i", type: "option", libelle: "Éclairage", ordre: 5, option_incluse: true, montant: 300 }),
      L({ id: "n", type: "option", libelle: "Moquette", ordre: 6, option_incluse: false, montant: 200 }),
    ];
    const r = construireProgbat(base(ls, 1300, { remise: -100, net_ht: 1200, remise_mode: "montant", remise_valeur: 100 }));
    expect(r.lignes.at(-3)).toEqual({ kind: "titre", n: "2", designation: "Options" });
    expect(r.fiche.options).toEqual([{ n: "2.1", libelle: "Éclairage", incluse: true, montant: 300 }, { n: "2.2", libelle: "Moquette", incluse: false, montant: 200 }]);
    expect(r.fiche.remise).toEqual({ mode: "montant", valeur: 100, montant: 100 });
    expect(r.fiche.net_ht_attendu).toBe(1200);
    expect(r.fiche.total_fichier).toBe(1300);
    expect(JSON.stringify(cellulesProgbat(r.lignes))).not.toMatch(/remise/i);
  });
  it("les clés internes injectées dans les données n'apparaissent jamais dans le fichier", () => {
    const o = { ...L({ id: "o", type: "objet", parent_id: "z", libelle: "Table", montant: 100 }), taux_vente: 55, cout_revient: 31, prix_achat: 12, coefficient: 1.4, marge: 40, note_claude: "SECRET" } as LigneClient;
    const r = construireProgbat(base([L({ id: "z", type: "zone", libelle: "Z" }), o], 100));
    const txt = JSON.stringify(cellulesProgbat(r.lignes));
    for (const v of ["SECRET", "31", "1.4", "40", "55"]) expect(txt).not.toContain(v);
  });
});

describe("Export ProGBat — 3 devis de référence", () => {
  for (const d of data) it(`${d.numero_progbat} : somme des lignes = total HT au centime`, () => {
    const lignes: CalcLigne[] = [], heures: CalcHeure[] = [], libres: CalcLibre[] = [];
    let n = 0;
    const charger = (ligne_id: string, ls: { type: string; heures?: number; montant_force?: number; quantite?: number; prix_unitaire_vente?: number }[]) => ls.forEach((l) => {
      if (l.type === "heures") heures.push({ ligne_id, heures: l.heures!, taux_vente: 0, montant_force: l.montant_force, par_unite: true });
      else libres.push({ ligne_id, quantite: l.quantite!, prix_forfait: l.prix_unitaire_vente, coefficient: 1, par_unite: true });
    });
    const cl: LigneClient[] = [];
    for (const ch of d.chapitres) {
      const id = `c${n++}`; const opt = ch.type === "option_incluse";
      const type = opt ? "option" : ch.objets.length ? "zone" : "chapitre_pose";
      lignes.push({ id, parent_id: null, type, quantite: 1, option_incluse: opt, ordre: n });
      cl.push(L({ id, type, libelle: ch.titre, ordre: n, option_incluse: opt }));
      for (const ob of ch.objets) {
        const oid = `o${n++}`; lignes.push({ id: oid, parent_id: id, type: "objet", quantite: ob.quantite, ordre: n });
        cl.push(L({ id: oid, parent_id: id, type: "objet", libelle: ob.titre, quantite: ob.quantite, ordre: n })); charger(oid, ob.lignes);
      }
      charger(id, ch.lignes);
    }
    const c = calculerDevis(lignes, heures, [], libres, 20, { mode: d.attendu.remise ? "montant" : "aucune", valeur: Math.abs(d.attendu.remise) });
    for (const l of cl) l.montant = c.lignes[l.id] ?? null;
    const r = construireProgbat(base(cl, c.total_ht, { remise: c.remise, net_ht: c.net_ht }));
    expect(r.fiche.controle_ok).toBe(true);
    expect(sommeLignes(r)).toBe(d.attendu.total_ht);
    expect(r.fiche.net_ht_attendu).toBe(d.attendu.net_ht);
    expect(r.fiche.remise.montant).toBe(Math.abs(d.attendu.remise));
    if (d.numero_progbat === "D-202610-2460") expect(r.fiche.options.some((o) => o.incluse)).toBe(true);
  });
});

describe("Transfert ProGBat", () => {
  it("numéro D-AAAAMM-NNNN obligatoire", () => {
    expect(NUMERO_PROGBAT_RE.test("D-202611-0012")).toBe(true);
    for (const x of ["D-20261-0012", "d-202611-0012", "202611-0012", "D-202611-12"]) expect(NUMERO_PROGBAT_RE.test(x)).toBe(false);
  });
  it("écart au centime", () => {
    expect(ecartTransfert(9510.99, 9510.99)).toBe(0);
    expect(ecartTransfert(9510.99, 9511)).toBe(0.01);
  });
  it("transféré ProGBat et envoyé sont deux faits distincts ; un ancien « transfere » sans numéro reste « Envoyé »", () => {
    expect(libelleStatutDevis("transfere", null, "2026-11-03")).toBe("Envoyé");
    expect(libelleStatutDevis("transfere", "D-202611-0012", null)).toBe("Transféré ProGBat");
    expect(libelleStatutDevis("transfere", "D-202611-0012", "2026-11-03")).toBe("Transféré ProGBat · envoyé");
    expect(libelleStatutDevis("valide", null, null, { valide: "Validé" })).toBe("Validé");
  });
});

describe("transfert ProGBat en deux temps", () => {
  it("accepte S + 6 chiffres (brouillon) et D-AAAAMM-NNNN (finalisé)", () => {
    expect(estNumeroProgbatValide("S003800")).toBe(true);
    expect(estNumeroProgbatValide("D-202611-0012")).toBe(true);
    for (const x of ["S03800", "s003800", "S0038000", "D-202611-12"]) expect(estNumeroProgbatValide(x)).toBe(false);
  });
  it("affiche ProGBat S003800 (brouillon) puis ProGBat D-202611-0012", () => {
    expect(libelleNumeroProgbat("S003800")).toBe("ProGBat S003800 (brouillon)");
    expect(libelleNumeroProgbat("D-202611-0012")).toBe("ProGBat D-202611-0012");
    expect(libelleStatutDevis("transfere", "S003800", null)).toBe("Importé ProGBat (brouillon)");
  });
  it("consignes : case des titres cochée, devis ProGBat neuf et vide", () => {
    const t = CONSIGNES_PROGBAT.join(" ");
    expect(t).toContain("La première ligne contient les titres");
    expect(t).toContain("neuf et vide");
    expect(t).not.toMatch(/supprimer la ligne d'en-tête/i);
  });
});
