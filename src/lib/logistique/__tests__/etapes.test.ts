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
    const c = conflitsVehicules([e("1", "2026-10-15", "2026-10-17", "v1"), { ...e("2", "2026-10-17", null, "v1"), affaire_id: "b" }]);
    expect([...c].sort()).toEqual(["1", "2"]);
  });

  it("deux étapes successives du même chantier avec le même véhicule ne sont jamais en conflit", () => {
    const chargement = { ...e("1", "2026-10-26", null, "v1"), heure_debut: "06:45", heure_fin: "07:15" };
    const montage = { ...e("2", "2026-10-26", null, "v1"), heure_debut: "08:00" };
    expect(conflitsVehicules([chargement, montage]).size).toBe(0);
    expect(conflitsVehicules([e("3", "2026-10-26", null, "v1"), e("4", "2026-10-26", null, "v1")]).size).toBe(0);
  });

  it("chantiers différents : conflit seulement si les créneaux se chevauchent", () => {
    const a = { ...e("1", "2026-10-26", null, "v1"), heure_debut: "06:45", heure_fin: "07:15" };
    const b = { ...e("2", "2026-10-26", null, "v1"), affaire_id: "b", heure_debut: "08:00", heure_fin: "10:00" };
    expect(conflitsVehicules([a, b]).size).toBe(0);
    const c = { ...b, heure_debut: "07:00" };
    expect([...conflitsVehicules([a, c])].sort()).toEqual(["1", "2"]);
  });

  it("sans heure de fin, l'étape court jusqu'à la fin de journée face aux autres chantiers", () => {
    const sansFin = { ...e("1", "2026-10-26", null, "v1"), heure_debut: "08:00" };
    const autre = { ...e("2", "2026-10-26", null, "v1"), affaire_id: "b", heure_debut: "18:00", heure_fin: "19:00" };
    expect([...conflitsVehicules([sansFin, autre])].sort()).toEqual(["1", "2"]);
    const avant = { ...autre, heure_debut: "06:00", heure_fin: "08:00" };
    expect(conflitsVehicules([sansFin, avant]).size).toBe(0);
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
