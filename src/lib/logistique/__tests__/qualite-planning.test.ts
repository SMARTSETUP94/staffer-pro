import { describe, expect, it } from "vitest";
import { indicateurQualite } from "../qualite-planning";

describe("indicateur qualité logistique", () => {
  it("complétude et véhicules sur les seuls transports, étapes annulées exclues", () => {
    const b = { heure_debut: null, lieu_id: null, lieu_libre: null, vehicule_id: null, responsable: null, source_type: null, statut: "valide" };
    const q = indicateurQualite([
      { ...b, type: "livraison", heure_debut: "08:00", lieu_id: "l", vehicule_id: "v", source_type: "email" },
      { ...b, type: "montage", lieu_libre: "Canal One", responsable: "Guillaume" },
      { ...b, type: "livraison", statut: "annule" },
    ], []);
    expect(q).toMatchObject({ etapes: 2, heure: 50, lieu_connu: 50, lieu_renseigne: 100, vehicule: 100, responsable: 50, source: 50, ia_gardees: null });
  });
  it("propositions IA gardées et heures justes", () => {
    const q = indicateurQualite([], [{ propose: [{ type: "livraison", date: "2026-11-16", heure_debut: "14:30" }, { type: "chargement", date: "2026-11-15" }],
      retenu: [{ type: "livraison", date: "2026-11-16", heure_debut: "14:30" }, { type: "montage", date: "2026-11-17", heure_debut: "08:00" }] }]);
    expect(q).toMatchObject({ ia_gardees: 50, ia_heures: 50, corrections: 1 });
  });
});
