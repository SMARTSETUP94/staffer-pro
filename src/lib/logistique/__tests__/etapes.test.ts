import { describe, it, expect } from "vitest";
import { conflitsVehicules, decalerEtape, etapeCouvreJour, type EtapeLite } from "../etapes";

const e = (id: string, deb: string, fin: string | null, veh: string | null, statut = "valide"): EtapeLite => ({
  id, affaire_id: "a", type: "livraison", date_debut: deb, date_fin: fin, vehicule_id: veh, statut,
});

describe("planning logistique", () => {
  it("une étape sans date de fin ne couvre que son jour", () => {
    expect(etapeCouvreJour(e("1", "2026-10-15", null, null), "2026-10-15")).toBe(true);
    expect(etapeCouvreJour(e("1", "2026-10-15", null, null), "2026-10-16")).toBe(false);
  });

  it("même véhicule sur des dates qui se chevauchent = conflit", () => {
    const c = conflitsVehicules([e("1", "2026-10-15", "2026-10-17", "v1"), e("2", "2026-10-17", null, "v1")]);
    expect([...c].sort()).toEqual(["1", "2"]);
  });

  it("pas de conflit si véhicules différents, dates disjointes ou étape annulée", () => {
    expect(conflitsVehicules([e("1", "2026-10-15", null, "v1"), e("2", "2026-10-15", null, "v2")]).size).toBe(0);
    expect(conflitsVehicules([e("1", "2026-10-15", null, "v1"), e("2", "2026-10-16", null, "v1")]).size).toBe(0);
    expect(conflitsVehicules([e("1", "2026-10-15", null, "v1"), e("2", "2026-10-15", null, "v1", "annule")]).size).toBe(0);
  });

  it("décaler une étape conserve sa durée", () => {
    expect(decalerEtape({ date_debut: "2026-10-15", date_fin: "2026-10-17" }, 2)).toEqual({
      date_debut: "2026-10-17", date_fin: "2026-10-19",
    });
  });
});
