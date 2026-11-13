import { describe, it, expect } from "vitest";
import { normaliserHeure, finDepuisDuree, corrigerAnnee, appliquerReglesEcheances, rapprocherLieu } from "../extraction-regles";
import { selectionnerExemples } from "../ia-feedback";

describe("règles d'extraction logistique", () => {
  it("normalise les heures écrites", () => {
    expect(normaliserHeure("7h")).toBe("07:00");
    expect(normaliserHeure("14h30")).toBe("14:30");
    expect(normaliserHeure("07:00:00".slice(0, 5))).toBe("07:00");
    expect(normaliserHeure("25h")).toBeNull();
  });
  it("calcule l'heure de fin depuis une durée", () => {
    expect(finDepuisDuree("08:00", 420)).toBe("15:00");
    expect(finDepuisDuree("20:00", 300)).toBeNull();
  });
  it("corrige 2024-11-03 en 2026-11-03 pour un mail reçu le 10/11/2026", () => {
    expect(corrigerAnnee("2024-11-03", "2026-11-10T09:00:00Z")).toEqual({ date: "2026-11-03", corrigee: true });
  });
  it("place 2024-02-24 en 2027 pour un mail reçu le 10/11/2026", () => {
    expect(corrigerAnnee("2024-02-24", "2026-11-10")).toEqual({ date: "2027-02-24", corrigee: true });
  });
  it("garde une date cohérente sans la toucher", () => {
    expect(corrigerAnnee("2026-11-18", "2026-11-10")).toEqual({ date: "2026-11-18", corrigee: false });
  });
  it("refuse heure_fin 00:00 hors nuit et calcule la fin depuis la durée", () => {
    const { echeances } = appliquerReglesEcheances([
      { date: "2026-11-18", libelle: "Livraison", heure_debut: "8h", heure_fin: "00:00", duree_minutes: 120 },
      { date: "2026-11-19", libelle: "Montage de nuit", heure_debut: "22:00", heure_fin: "00:00" },
    ], "2026-11-10");
    expect(echeances[0].heure_debut).toBe("08:00");
    expect(echeances[0].heure_fin).toBe("10:00");
    expect(echeances[1].heure_fin).toBe("00:00");
  });
  it("rapproche « Pecqueuse, atelier » du lieu Pecqueuse et signale un lieu inconnu", () => {
    const lieux = [{ id: "p", label: "Pecqueuse" }, { id: "s", label: "SET UP" }];
    const alias = [{ alias: "atelier vitry", lieu_id: "s" }];
    expect(rapprocherLieu("Pecqueuse, atelier", lieux, alias)).toEqual({ lieu_id: "p", lieu_douteux: false });
    expect(rapprocherLieu("Atelier Vitry", lieux, alias)).toEqual({ lieu_id: "s", lieu_douteux: false });
    expect(rapprocherLieu("Studio Lendit", lieux, alias)).toEqual({ lieu_id: null, lieu_douteux: true });
    expect(rapprocherLieu("", lieux, alias)).toEqual({ lieu_id: null, lieu_douteux: false });
  });
  it("choisit au plus 8 exemples proches, jamais le mail testé", () => {
    const r = (s: string) => ({ email_subject: s, propose: [], retenu: [], commentaire: "x" });
    const rows = [r("Emballage + chargement : 6073"), r("Livraison Fremantle"), r("Chargement 6073 Lendit"), ...Array.from({ length: 10 }, (_, i) => r(`Autre ${i}`))];
    const out = selectionnerExemples(rows, "Emballage + chargement : 6073");
    expect(out.some((x) => x.email_subject === "Emballage + chargement : 6073")).toBe(false);
    expect(out[0].email_subject).toBe("Chargement 6073 Lendit");
    expect(out.length).toBeLessThanOrEqual(8);
    expect(out.length).toBeGreaterThanOrEqual(5);
  });
});
