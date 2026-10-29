import { describe, it, expect } from "vitest";
import {
  matchSansDessinateur,
  matchSansResponsableProjet,
  STATUTS_SANS_DESSINATEUR,
  STATUTS_SANS_RESPONSABLE_PROJET,
} from "../opportunite-filtres-roles";

describe("filtre « Sans D » (sans dessinateur/concepteur)", () => {
  it("remonte à l'étude, presque gagné et gagné sans concepteur", () => {
    expect(matchSansDessinateur({ statut_opportunite: "a_l_etude", roles_affectes: [] })).toBe(true);
    expect(matchSansDessinateur({ statut_opportunite: "presque_gagne", roles_affectes: [] })).toBe(true);
    expect(matchSansDessinateur({ statut_opportunite: "gagne", roles_affectes: [] })).toBe(true);
  });
  it("ignore les autres statuts même sans concepteur", () => {
    expect(matchSansDessinateur({ statut_opportunite: "a_faire", roles_affectes: [] })).toBe(false);
    expect(matchSansDessinateur({ statut_opportunite: "envoye", roles_affectes: [] })).toBe(false);
    expect(matchSansDessinateur({ statut_opportunite: "perdu", roles_affectes: [] })).toBe(false);
  });
  it("exclut une opportunité dont le concepteur est pourvu", () => {
    expect(matchSansDessinateur({ statut_opportunite: "a_l_etude", roles_affectes: ["concepteur"] })).toBe(false);
    expect(matchSansDessinateur({ statut_opportunite: "gagne", roles_affectes: ["concepteur", "responsable_projet"] })).toBe(false);
  });
  it("tolère des rôles non encore chargés (undefined)", () => {
    expect(matchSansDessinateur({ statut_opportunite: "presque_gagne" })).toBe(true);
  });
});

describe("filtre « Sans RP » (sans responsable projet)", () => {
  it("remonte presque gagné et gagné sans responsable projet", () => {
    expect(matchSansResponsableProjet({ statut_opportunite: "presque_gagne", roles_affectes: [] })).toBe(true);
    expect(matchSansResponsableProjet({ statut_opportunite: "gagne", roles_affectes: ["concepteur"] })).toBe(true);
  });
  it("ne concerne pas à l'étude ni les statuts plus précoces", () => {
    expect(matchSansResponsableProjet({ statut_opportunite: "a_l_etude", roles_affectes: [] })).toBe(false);
    expect(matchSansResponsableProjet({ statut_opportunite: "a_faire", roles_affectes: [] })).toBe(false);
    expect(matchSansResponsableProjet({ statut_opportunite: "envoye", roles_affectes: [] })).toBe(false);
  });
  it("exclut une opportunité dont le responsable projet est pourvu", () => {
    expect(matchSansResponsableProjet({ statut_opportunite: "gagne", roles_affectes: ["responsable_projet"] })).toBe(false);
  });
});

describe("périmètres de statuts", () => {
  it("sans D = à l'étude + presque gagné + gagné", () => {
    expect(STATUTS_SANS_DESSINATEUR).toEqual(["a_l_etude", "presque_gagne", "gagne"]);
  });
  it("sans RP = presque gagné + gagné", () => {
    expect(STATUTS_SANS_RESPONSABLE_PROJET).toEqual(["presque_gagne", "gagne"]);
  });
});
