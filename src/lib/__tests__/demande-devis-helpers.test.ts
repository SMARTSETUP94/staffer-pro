import { describe, it, expect } from "vitest";
import {
  buildDemandeDevisTexte,
  type AffaireForDevis,
  type TrajetForDevis,
} from "../demande-devis-helpers";

const trajet1: TrajetForDevis = {
  date: "2025-04-21",
  heure_depart: "08:30:00",
  categorie: "pose",
  adresse_depart: "12 rue Lafayette, 75009 Paris",
  adresse_arrivee: "Stand A4, Parc des Expositions, 93420 Villepinte",
  notes: null,
};

const trajet2: TrajetForDevis = {
  date: "2025-04-22",
  heure_depart: null,
  categorie: "depose",
  adresse_depart: "Stand A4, Villepinte",
  adresse_arrivee: "Entrepôt Vitry",
  notes: "Prévoir transpalette",
};

const affaire: AffaireForDevis = {
  numero: "AFF-2025-001",
  nom: "Salon du Livre",
  client: "ACME Inc.",
};

describe("buildDemandeDevisTexte", () => {
  it("construit un texte avec affaire, client et plusieurs trajets", () => {
    const texte = buildDemandeDevisTexte(affaire, [trajet1, trajet2]);
    expect(texte).toContain("Bonjour,");
    expect(texte).toContain("AFF-2025-001 — Salon du Livre");
    expect(texte).toContain("(ACME Inc.)");
    expect(texte).toContain("Cordialement,");
    expect(texte).toContain("L'équipe Setup Paris");
  });

  it("inclut chaque trajet numéroté avec sa catégorie traduite", () => {
    const texte = buildDemandeDevisTexte(affaire, [trajet1, trajet2]);
    expect(texte).toMatch(/1\..*Pose/);
    expect(texte).toMatch(/2\..*Dépose/);
  });

  it("inclut l'heure de départ formatée HH:MM si présente", () => {
    const texte = buildDemandeDevisTexte(affaire, [trajet1]);
    expect(texte).toContain("à 08:30");
    expect(texte).not.toContain("08:30:00");
  });

  it("omet l'heure si absente", () => {
    const texte = buildDemandeDevisTexte(affaire, [trajet2]);
    // Pas de " à HH:MM" pour trajet2
    expect(texte).not.toMatch(/à \d{2}:\d{2}/);
  });

  it("inclut adresses départ et arrivée", () => {
    const texte = buildDemandeDevisTexte(affaire, [trajet1]);
    expect(texte).toContain("Départ : 12 rue Lafayette, 75009 Paris");
    expect(texte).toContain("Arrivée : Stand A4, Parc des Expositions, 93420 Villepinte");
  });

  it("inclut les notes uniquement si présentes", () => {
    const texte = buildDemandeDevisTexte(affaire, [trajet1, trajet2]);
    expect(texte).toContain("Notes : Prévoir transpalette");
    // trajet1 n'a pas de notes → on ne doit pas voir de "Notes :" sur sa section
    const lines = texte.split("\n");
    const trajet1Idx = lines.findIndex((l) => l.startsWith("1."));
    const trajet2Idx = lines.findIndex((l) => l.startsWith("2."));
    const slice1 = lines.slice(trajet1Idx, trajet2Idx).join("\n");
    expect(slice1).not.toContain("Notes :");
  });

  it("formate la date en français long (ex: 'lundi 21 avril 2025')", () => {
    const texte = buildDemandeDevisTexte(affaire, [trajet1]);
    expect(texte.toLowerCase()).toContain("21 avril 2025");
  });

  it("gère une affaire sans client (pas de parenthèses vides)", () => {
    const aff: AffaireForDevis = { numero: "AFF-X", nom: "Test", client: null };
    const texte = buildDemandeDevisTexte(aff, [trajet1]);
    expect(texte).toContain("AFF-X — Test");
    expect(texte).not.toContain("()");
    expect(texte).not.toContain("(null)");
  });

  it("gère le cas sans affaire (trajets orphelins)", () => {
    const texte = buildDemandeDevisTexte(null, [trajet1]);
    expect(texte).toContain(
      "Nous souhaitons obtenir un devis de transport pour les trajets suivants",
    );
    expect(texte).not.toContain("affaire");
  });

  it("retourne un texte cohérent même avec un seul trajet", () => {
    const texte = buildDemandeDevisTexte(affaire, [trajet1]);
    expect(texte.startsWith("Bonjour,")).toBe(true);
    expect(texte.trim().endsWith("L'équipe Setup Paris")).toBe(true);
  });

  it("garde l'ordre des trajets dans la sortie", () => {
    const texte = buildDemandeDevisTexte(affaire, [trajet2, trajet1]);
    const idx2 = texte.indexOf("Stand A4, Villepinte");
    const idx1 = texte.indexOf("12 rue Lafayette");
    expect(idx2).toBeLessThan(idx1);
  });

  it("fallback sur la valeur brute si la catégorie est inconnue", () => {
    const t: TrajetForDevis = { ...trajet1, categorie: "categorie_inconnue" };
    const texte = buildDemandeDevisTexte(affaire, [t]);
    expect(texte).toContain("categorie_inconnue");
  });
});
