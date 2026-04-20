import { describe, it, expect } from "vitest";
import {
  parseNomComplet,
  parseContrat,
  parseFrenchDate,
  mapPosteToMetier,
  isPosteNonStaffing,
  parseCsv,
} from "../employes-import";

/* ------------------------------------------------------------------ */
/* parseNomComplet                                                     */
/* ------------------------------------------------------------------ */

describe("parseNomComplet", () => {
  it("parse format standard 'XX- NOM Prénom - Y'", () => {
    expect(parseNomComplet("AB- DUPONT Jean - P")).toEqual({
      nom: "DUPONT",
      prenom: "Jean",
    });
  });

  it("gère les NBSP et espaces multiples", () => {
    expect(parseNomComplet("AB-\u00a0MARTIN  Pierre")).toEqual({
      nom: "MARTIN",
      prenom: "Pierre",
    });
  });

  it("gère un nom tout en MAJ sans préfixe : dernier token = prénom", () => {
    expect(parseNomComplet("BOUZIDI FARES")).toEqual({
      nom: "BOUZIDI",
      prenom: "Fares",
    });
  });

  it("gère un nom tout en casse mixte : premier = nom", () => {
    expect(parseNomComplet("Carvalho Alberto")).toEqual({
      nom: "CARVALHO",
      prenom: "Alberto",
    });
  });

  it("retire suffixes multiples '- MP - AE'", () => {
    expect(parseNomComplet("AB- DURAND Sophie - MP - AE")).toEqual({
      nom: "DURAND",
      prenom: "Sophie",
    });
  });

  it("retire un suffixe collé '-C'", () => {
    expect(parseNomComplet("Brieg -C")).toEqual({
      nom: "BRIEG",
      prenom: "Brieg",
    });
    // edge case : si un seul token, on ne peut pas séparer → on retourne null ailleurs
  });

  it("retourne null si entrée vide", () => {
    expect(parseNomComplet("")).toBeNull();
    expect(parseNomComplet("   ")).toBeNull();
  });

  it("préserve les noms composés avec tiret dans le prénom", () => {
    const r = parseNomComplet("AB- LEROY Jean-Pierre");
    expect(r?.nom).toBe("LEROY");
    expect(r?.prenom).toBe("Jean-Pierre");
  });
});

/* ------------------------------------------------------------------ */
/* parseContrat                                                        */
/* ------------------------------------------------------------------ */

describe("parseContrat", () => {
  it("CDI standard", () => {
    expect(parseContrat("CDI")).toEqual({
      type: "CDI",
      sousType: null,
      isApprenti: false,
      interimSuffix: null,
    });
  });

  it("CDD-APPR détecte apprenti", () => {
    expect(parseContrat("CDD - APPR").isApprenti).toBe(true);
    expect(parseContrat("CDD-APPR").isApprenti).toBe(true);
  });

  it("INTER-P extrait le suffixe pour mapping métier", () => {
    expect(parseContrat("INTER-P")).toMatchObject({
      type: "Interim",
      sousType: "INTER-P",
      interimSuffix: "P",
    });
  });

  it("IND → Independant", () => {
    expect(parseContrat("IND").type).toBe("Independant");
  });

  it("contrat inconnu → fallback CDI avec sousType", () => {
    const r = parseContrat("EXOTIQUE");
    expect(r.type).toBe("CDI");
    expect(r.sousType).toBe("EXOTIQUE");
  });
});

/* ------------------------------------------------------------------ */
/* parseFrenchDate                                                     */
/* ------------------------------------------------------------------ */

describe("parseFrenchDate", () => {
  it("convertit JJ/MM/AAAA en ISO", () => {
    expect(parseFrenchDate("15/03/1985")).toBe("1985-03-15");
  });

  it("accepte tirets et points", () => {
    expect(parseFrenchDate("01-12-2000")).toBe("2000-12-01");
    expect(parseFrenchDate("01.12.2000")).toBe("2000-12-01");
  });

  it("complète l'année 2 chiffres : <30 → 20XX, >30 → 19XX", () => {
    expect(parseFrenchDate("01/01/25")).toBe("2025-01-01");
    expect(parseFrenchDate("01/01/85")).toBe("1985-01-01");
  });

  it("retourne null sur format invalide", () => {
    expect(parseFrenchDate("not a date")).toBeNull();
    expect(parseFrenchDate("")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* mapPosteToMetier + isPosteNonStaffing                               */
/* ------------------------------------------------------------------ */

describe("mapPosteToMetier", () => {
  it("Constructeur → construction", () => {
    expect(mapPosteToMetier("Constructeur")).toBe("construction");
  });

  it("gère diacritiques et casse mixte", () => {
    expect(mapPosteToMetier("Peintre Déco")).toBe("peinture");
    expect(mapPosteToMetier("OPÉRATEUR COMMANDE NUMÉRIQUE")).toBe("numerique");
  });

  it("inclusion : 'Peintre déco - intérimaire' → peinture", () => {
    expect(mapPosteToMetier("Peintre déco - intérimaire")).toBe("peinture");
  });

  it("poste vide → null", () => {
    expect(mapPosteToMetier("")).toBeNull();
  });
});

describe("isPosteNonStaffing", () => {
  it("Comptable → true", () => {
    expect(isPosteNonStaffing("Comptable")).toBe(true);
    expect(isPosteNonStaffing("Assistante RH")).toBe(true);
  });

  it("Constructeur → false", () => {
    expect(isPosteNonStaffing("Constructeur")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* parseCsv (intégration)                                              */
/* ------------------------------------------------------------------ */

describe("parseCsv", () => {
  const HEADER =
    "Nom complet;Contrat;Poste;Téléphone;Mobile;Email;Date naissance;Adresse";

  it("parse un CSV standard avec en-tête", () => {
    const csv = `${HEADER}\nAB- DUPONT Jean - P;CDI;Constructeur;;0606060606;jean@a.fr;01/01/1980;1 rue X`;
    const r = parseCsv(csv);
    expect(r.totalLines).toBe(1);
    expect(r.rows[0].parsed.nom).toBe("DUPONT");
    expect(r.rows[0].parsed.metierCode).toBe("construction");
    expect(r.rows[0].parsed.competencesSecondairesCodes).toEqual(["machiniste"]);
    expect(r.rows[0].parsed.email).toBe("jean@a.fr");
    expect(r.rows[0].errors).toHaveLength(0);
  });

  it("Constructeur ajoute machiniste en compétence secondaire", () => {
    const csv = `${HEADER}\nAB- TEST Pierre;CDI;Constructeur;;;;;`;
    const r = parseCsv(csv);
    expect(r.rows[0].parsed.competencesSecondairesCodes).toContain("machiniste");
  });

  it("INTER-X sans poste déduit le métier du suffixe", () => {
    const csv = `${HEADER}\nAB- TEST Marc;INTER-P;;;;;;`;
    const r = parseCsv(csv);
    expect(r.rows[0].parsed.metierCode).toBe("peinture");
    expect(r.rows[0].parsed.type_contrat).toBe("Interim");
    expect(r.rows[0].warnings.some((w) => w.includes("suffixe"))).toBe(true);
  });

  it("poste administratif → exclu du staffing", () => {
    const csv = `${HEADER}\nAB- COMPTA Sandrine;CDI;Comptable;;;;;`;
    const r = parseCsv(csv);
    expect(r.rows[0].parsed.non_staffing).toBe(true);
    expect(r.rows[0].parsed.actif).toBe(false);
    expect(r.rows[0].excluded).toBe(true);
  });

  it("poste vide sans suffixe métier → exclu", () => {
    const csv = `${HEADER}\nAB- VIDE Anna;CDI;;;;;;`;
    const r = parseCsv(csv);
    expect(r.rows[0].excluded).toBe(true);
    expect(r.rows[0].warnings.some((w) => w.includes("Poste vide"))).toBe(true);
  });

  it("nom illisible → erreur bloquante", () => {
    const csv = `${HEADER}\n;CDI;Constructeur;;;;;`;
    const r = parseCsv(csv);
    expect(r.rows[0].errors).toContain("Nom complet illisible");
  });

  it("CSV vide → 0 lignes, pas de crash", () => {
    expect(parseCsv("").rows).toEqual([]);
    expect(parseCsv(HEADER).rows).toEqual([]);
  });

  it("date naissance illisible → warning non bloquant", () => {
    const csv = `${HEADER}\nAB- TEST Lou;CDI;Constructeur;;;;not-a-date;`;
    const r = parseCsv(csv);
    expect(r.rows[0].parsed.date_naissance).toBeNull();
    expect(r.rows[0].warnings.some((w) => w.toLowerCase().includes("date"))).toBe(true);
    expect(r.rows[0].errors).toHaveLength(0);
  });

  it("normalise email en lowercase", () => {
    const csv = `${HEADER}\nAB- TEST Lou;CDI;Constructeur;;;LOU@A.FR;;`;
    const r = parseCsv(csv);
    expect(r.rows[0].parsed.email).toBe("lou@a.fr");
  });
});
