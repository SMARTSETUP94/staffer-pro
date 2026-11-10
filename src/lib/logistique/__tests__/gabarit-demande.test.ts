import { describe, expect, it } from "vitest";
import { commentaireEquipe, lireGabaritLogistique, lireHeures, trouverVehicule } from "../gabarit-demande";

const MAIL_6053 = `Bonjour toi IA,
Test template logistiques
-Catégorie : appro
-véhicule : petit colis
-projet : 6053
-date : mardi 10 novembre à partir de 17h
-adresse : 45 rue Ampère 95300 Ennery
-contact sur place : 01 34 33 09 83 - 06 07 55 82 61
-nombre de personnes : 1
-chef d'équipe : Guillaume
-Commentaire : devis fourni pour contacte sur place

Envoyé à partir de Outlook pour Android
From: p.arlot@orange.fr <p.arlot@orange.fr>
Sent: Tuesday, 10 November 2026 00:54:25
Subject: RE: Re: Demande de prix 6053
Les tournages seront disponibles à partir de mardi 17h.
De : Guillaume MAQUARIE
Projet : 6053
Date : jeudi 12 novembre
Catégorie : livraison
Concernant les délais, pourrions-nous récupérer les chariots jeudi matin ?`;

const RECU = new Date("2026-11-10T05:17:09Z");

describe("gabarit demande logistique", () => {
  it("mail 6053 : une seule étape appro le 10/11 à partir de 17h, historique ignoré", () => {
    const r = lireGabaritLogistique(MAIL_6053, RECU)!;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      date: "2026-11-10", type: "appro", affaire_numero: "6053",
      heure_debut: "17:00", heure_fin: null, a_partir_de: true,
      lieu: "45 rue Ampère 95300 Ennery", vehicule: "petit colis", nb_personnes: 1,
      responsable: "Guillaume", contact_sur_place: "01 34 33 09 83 / 06 07 55 82 61",
      commentaire: "devis fourni pour contacte sur place", source: "gabarit",
    });
  });

  it("aucun gabarit → null (l'IA prend le relais)", () => {
    expect(lireGabaritLogistique("Bonjour, pouvez-vous livrer jeudi ?", RECU)).toBeNull();
  });

  it("deux catégories → deux interventions, projet partagé", () => {
    const r = lireGabaritLogistique("Projet : 4123\nCatégorie : montage\nDate : 12/11\nHeure : 8h-12h\nCatégorie : demontage\nDate : 14/11\nHeure : 20h", RECU)!;
    expect(r.map((e) => [e.type, e.date, e.heure_debut, e.heure_fin, e.affaire_numero])).toEqual([
      ["montage", "2026-11-12", "08:00", "12:00", "4123"],
      ["demontage", "2026-11-14", "20:00", null, "4123"],
    ]);
  });

  it("date de janvier reçue en novembre → année suivante", () => {
    expect(lireGabaritLogistique("Catégorie : livraison\nDate : 5 janvier\nAdresse : Studio", RECU)![0].date).toBe("2027-01-05");
  });

  it("heures", () => {
    expect(lireHeures("de 8h30 à 12h")).toEqual({ debut: "08:30", fin: "12:00", aPartirDe: false });
    expect(lireHeures("avant 10h")).toEqual({ debut: null, fin: "10:00", aPartirDe: false });
  });

  it("petit colis n'est pas un véhicule de la flotte et part dans le commentaire", () => {
    const flotte = [{ id: "1", nom: "Master", immatriculation: "AB-123-CD" }];
    expect(trouverVehicule("petit colis", flotte)).toBeNull();
    expect(trouverVehicule("master", flotte)?.id).toBe("1");
    expect(commentaireEquipe({ contact_sur_place: "01 34", acces: null, commentaire: "devis fourni", vehicule: "petit colis" }, false))
      .toBe("Contact sur place : 01 34\nVéhicule : petit colis\ndevis fourni");
  });
});
