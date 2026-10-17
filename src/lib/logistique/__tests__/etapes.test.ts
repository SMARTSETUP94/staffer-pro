import { describe, it, expect } from "vitest";
import { calendrierChantier, conflitsVehicules, decalerEtape, etapeCouvreJour, type EtapeLite } from "../etapes";

const e = (id: string, deb: string, fin: string | null, veh: string | null, statut = "valide"): EtapeLite => ({
  id, affaire_id: "a", type: "livraison", date_debut: deb, date_fin: fin, vehicule_id: veh, statut,
});

describe("planning logistique", () => {
  it("le calendrier n'affiche que le chantier sélectionné", () => {
    const jours = calendrierChantier([e("1", "2026-10-19", null, null), { ...e("2", "2026-10-19", null, null), affaire_id: "b" }], "a");
    expect(jours[0]?.etapes.map((row) => row.id)).toEqual(["1"]);
  });

  it("le calendrier masque les dates vides et trie chronologiquement", () => {
    expect(calendrierChantier([e("2", "2026-10-22", null, null), e("1", "2026-10-19", null, null)], "a").map((jour) => jour.date)).toEqual(["2026-10-19", "2026-10-22"]);
  });

  it("une étape de plusieurs jours couvre chaque date de sa période", () => {
    expect(calendrierChantier([e("1", "2026-10-19", "2026-10-21", null)], "a").map((jour) => jour.date)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
  });

  it("une étape annulée ne crée aucune date dans le calendrier", () => {
    expect(calendrierChantier([e("1", "2026-10-19", null, null, "annule")], "a")).toEqual([]);
  });

  it("les étapes d'une date sont triées par horaire", () => {
    const rows = [{ ...e("1", "2026-10-19", null, null), heure_debut: "14:00" }, { ...e("2", "2026-10-19", null, null), heure_debut: "08:00" }];
    expect(calendrierChantier(rows, "a")[0]?.etapes.map((row) => row.id)).toEqual(["2", "1"]);
  });

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
