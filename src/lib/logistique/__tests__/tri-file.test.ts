import { describe, it, expect } from "vitest";
import { proposerTri, bilanTri } from "../tri-file";

describe("tri de la file logistique", () => {
  it("reconnaît les suivis de commande fournisseur", () => {
    expect(proposerTri({ subject: "[La Centrale du Verre] Mise en fabrication" })).toBe("fournisseur_suivi");
    expect(proposerTri({ subject: "[Etoffe.com] Votre colis est en route" })).toBe("fournisseur_suivi");
    expect(proposerTri({ subject: "CTN - Commande CDV2610800" })).toBe("fournisseur_suivi");
  });
  it("reconnaît les relances de factures de stockage et les notifications Teams", () => {
    expect(proposerTri({ subject: "RE: Smart Restructuring SET UP - 1ère Relance " })).toBe("relance_facture");
    expect(proposerTri({ subject: "Guillaume a envoyé un message" })).toBe("notification_teams");
    expect(proposerTri({ subject: "x", from_email: "no-reply@teams.mail.microsoft" })).toBe("notification_teams");
  });
  it("laisse en attente les vraies demandes", () => {
    expect(proposerTri({ subject: "Emballage + chargement : 6073" })).toBeNull();
    expect(proposerTri({ subject: "TR: Livraison 12 mai - Roland Garros" })).toBeNull();
    expect(proposerTri({ subject: "RE: loges roland garros" })).toBeNull();
    expect(proposerTri({ subject: "[La Centrale du Verre] Disponible en retrait - Dépôt" })).toBeNull();
    expect(proposerTri({ subject: "RE: [Monvitrage.fr] Message d'un client" })).toBeNull();
  });
  it("le bilan compte par lot et garde le reste", () => {
    const b = bilanTri([
      { id: "1", subject: "[Etoffe.com] Votre commande 249475", from_email: null, received_at: "", source_boite: "smart" },
      { id: "2", subject: "Patrick sent a message", from_email: null, received_at: "", source_boite: "smart" },
      { id: "3", subject: "Emballage + chargement : 6073", from_email: null, received_at: "", source_boite: "logistique" },
    ]);
    expect(b.restant).toBe(1);
    expect(b.groupes.map((g) => [g.groupe, g.nombre])).toEqual([["fournisseur_suivi", 1], ["notification_teams", 1]]);
  });
});
