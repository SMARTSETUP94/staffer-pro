import { describe, it, expect } from "vitest";
import {
  rolesManquants, rolesVisibles, phasesFromList, presqueGagneEnRetard, chargeLabel,
  ordonnerCandidats, periodeProposee, periodesEnChevauchement, affichagePilotage, typologieEffective,
} from "../equipe-projet";

const fab = phasesFromList(["commercial_etude", "fabrication", "logistique"]);
const md = phasesFromList(["commercial_etude", "logistique", "montage", "demontage"]);

describe("badges rôle à affecter", () => {
  it("presque gagné → concepteur", () => {
    expect(rolesManquants({ phase: "opportunite", statut_opportunite: "presque_gagne" }, fab, [])).toEqual(["concepteur"]);
  });
  it("gagné → concepteur + responsable projet", () => {
    expect(rolesManquants({ phase: "opportunite", statut_opportunite: "gagne" }, fab, ["concepteur"])).toEqual(["responsable_projet"]);
  });
  it("signé fabrication → constructeur + finition", () => {
    expect(rolesManquants({ phase: "signe" }, fab, ["concepteur", "responsable_projet"])).toEqual(["chef_constructeur", "chef_finition"]);
  });
  it("signé montage → montage + démontage", () => {
    expect(rolesManquants({ phase: "signe" }, md, ["concepteur", "responsable_projet"])).toEqual(["chef_montage", "chef_demontage"]);
  });
  it("à faire / envoyé → aucun badge", () => {
    expect(rolesManquants({ phase: "opportunite", statut_opportunite: "envoye" }, fab, [])).toEqual([]);
  });
  it("rôles visibles selon typologie", () => {
    expect(rolesVisibles(fab)).not.toContain("chef_montage");
    expect(rolesVisibles(md)).not.toContain("chef_finition");
  });
  it("opportunité utilise la typologie future", () => {
    expect(typologieEffective({ phase: "opportunite", typologie: "prototype", typologie_future: "fabrication" })).toBe("fabrication");
  });
});

describe("presque gagné > 15 jours", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  it("alerte après 15 jours", () => expect(presqueGagneEnRetard("presque_gagne", "2026-10-11T12:00:00Z", now)).toBe(true));
  it("pas d'alerte à 14 jours", () => expect(presqueGagneEnRetard("presque_gagne", "2026-10-13T12:00:00Z", now)).toBe(false));
  it("pas d'alerte sur un autre statut", () => expect(presqueGagneEnRetard("gagne", "2026-01-01", now)).toBe(false));
});

describe("compteur de charge", () => {
  it("affiche réel et potentiel séparés", () => {
    expect(chargeLabel("Nadège", { nb_en_cours: 4, nb_potentielles: 3 })).toBe("Nadège – 4 en cours (+3 potentielles)");
  });
  it("sans potentiel", () => expect(chargeLabel("Guillaume", { nb_en_cours: 2, nb_potentielles: 0 })).toBe("Guillaume – 2 en cours"));
});

describe("ordre du sélecteur", () => {
  it("principaux, secondaires, puis autres actifs", () => {
    const e = (id: string, nom: string, actif = true) => ({ id, nom, prenom: null, actif });
    const r = ordonnerCandidats([e("c", "Zed"), e("a", "Alpha"), e("b", "Beta"), e("x", "Inactif", false)],
      [{ employe_id: "b", niveau: "secondaire" }, { employe_id: "c", niveau: "principal" }]);
    expect(r.map((o) => o.employe.id)).toEqual(["c", "b", "a"]);
  });
});

describe("période proposée", () => {
  it("responsable projet : production → démontage", () => {
    expect(periodeProposee("responsable_projet", { date_debut_production: "2026-11-02", date_demontage: "2026-11-20" }))
      .toEqual({ date_debut: "2026-11-02", date_fin: "2026-11-20" });
  });
  it("concepteur : 3 jours avant la production", () => {
    expect(periodeProposee("concepteur", { date_debut_production: "2026-11-10" }, "2026-10-27"))
      .toEqual({ date_debut: "2026-11-07", date_fin: "2026-11-09" });
  });
});

describe("planning pilotage", () => {
  it("détecte les chevauchements entre affaires", () => {
    const s = periodesEnChevauchement([
      { affaire_id: "a", date_debut: "2026-11-01", date_fin: "2026-11-05" },
      { affaire_id: "b", date_debut: "2026-11-05", date_fin: "2026-11-08" },
      { affaire_id: "c", date_debut: "2026-11-10", date_fin: "2026-11-12" },
    ]);
    expect([...s].sort()).toEqual(["a", "b"]);
  });
  it("rendu par statut", () => {
    expect(affichagePilotage({ phase: "signe" })).toBe("plein");
    expect(affichagePilotage({ phase: "opportunite", statut_opportunite: "presque_gagne" })).toBe("attenue");
    expect(affichagePilotage({ phase: "opportunite", statut_opportunite: "envoye" })).toBe("potentiel");
  });
});
