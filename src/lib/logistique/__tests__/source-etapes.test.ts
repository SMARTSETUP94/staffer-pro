import { describe, expect, it } from "vitest";
import { avertissementHoraire, bilanRattachement, rapprocherResponsable, repartirSelonDoublons } from "../source-etapes";

describe("horaires (M-L3)", () => {
  it("fin identique au début refusée", () => expect(avertissementHoraire("08:00", "08:00")?.niveau).toBe("refus"));
  it("montage de nuit 21:30 → 03:30 accepté", () => expect(avertissementHoraire("21:30", "03:30")?.niveau).toBe("info"));
  it("fin à 00:00 : avertissement, pas refus", () => expect(avertissementHoraire("20:00", "00:00")?.niveau).toBe("alerte"));
  it("horaire normal sans message", () => expect(avertissementHoraire("14:30", "15:00")).toBeNull());
});

describe("responsable rapproché d'un employé actif", () => {
  const emp = [{ id: "g", prenom: "Guillaume", nom: "MAQUARIE" }, { id: "a", prenom: "Alberto", nom: "Carvalho" }, { id: "g2", prenom: "Guillaume", nom: "Petit" }];
  it("nom complet dans les deux sens", () => {
    expect(rapprocherResponsable("maquarie guillaume", emp)?.id).toBe("g");
    expect(rapprocherResponsable("G. Maquarie", emp)?.id).toBe("g");
  });
  it("prénom ambigu : aucun rapprochement", () => expect(rapprocherResponsable("Guillaume", emp)).toBeNull());
  it("prénom unique rapproché", () => expect(rapprocherResponsable("Alberto", emp)?.nom).toBe("Alberto Carvalho"));
  it("inconnu : aucun rapprochement", () => expect(rapprocherResponsable("Jean", emp)).toBeNull());
});

describe("doublons", () => {
  const d = [{ index: 0, etape_id: "e1", date_debut: "2026-11-16", date_fin: null, heure_debut: null, lieu_libre: null, source_type: null, origine: "manuel" },
    { index: 1, etape_id: "e2", date_debut: "2026-11-17", date_fin: null, heure_debut: null, lieu_libre: null, source_type: "email", origine: "jalonnement" }];
  it("par défaut fusionner : rien recréé, étape sans source rattachée", () =>
    expect(repartirSelonDoublons(3, d, {})).toEqual({ aCreer: [2], aRattacher: ["e1"], ecartees: [0, 1] }));
  it("créer quand même et ignorer", () =>
    expect(repartirSelonDoublons(3, d, { 0: "creer", 1: "ignorer" })).toEqual({ aCreer: [0, 2], aRattacher: [], ecartees: [1] }));
});

describe("bilan de rattachement d'un jalonnement", () => {
  const et = [{ id: "x", affaire_numero: "4120", type: "montage", date_debut: "2026-11-16", date_fin: "2026-11-17", heure_debut: "08:00", source_type: null },
    { id: "y", affaire_numero: "4127", type: "livraison", date_debut: "2026-11-18", date_fin: null, heure_debut: null, source_type: "jalonnement" }];
  it("ligne à ligne", () => {
    const b = bilanRattachement([
      { numero_affaire: "4120", type: "montage", date_debut: "2026-11-17", heure_debut: "08:15" },
      { numero_affaire: "4127", type: "livraison", date_debut: "2026-11-18" },
      { numero_affaire: "4130", type: "montage", date_debut: "2026-11-19" },
      { type: "montage", date_debut: "2026-11-19" }], et);
    expect(b.map((x) => x.resultat)).toEqual(["rattacher", "deja_rattachee", "a_creer", "chantier_inconnu"]);
  });
});
