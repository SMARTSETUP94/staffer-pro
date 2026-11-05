import { describe, expect, it } from "vitest";
import {
  basculer, basculerQualif, libelleLimite, libelleSemaine, messageWhatsApp, normaliserTelephone,
  numeroSemaine, passeFiltreDispos, phraseResume, resumeDispos,
} from "../dispos";

const vide = { jour: "2026-11-09", journee: false, soiree: false, pas_dispo: false };

describe("dispos", () => {
  it("libellé de la semaine 9 → 15 novembre", () => {
    expect(libelleSemaine("2026-11-09")).toBe("Semaine du lundi 9 au dimanche 15 novembre");
    expect(numeroSemaine("2026-11-09")).toBe(46);
  });
  it("heure limite vendredi 6 novembre, 12 h (Paris)", () => {
    expect(libelleLimite("2026-11-06T11:00:00Z")).toBe("vendredi 6 novembre, 12 h");
  });
  it("Pas dispo est exclusif, Journée et Soirée cumulables", () => {
    const js = basculer(basculer(vide, "journee"), "soiree");
    expect([js.journee, js.soiree]).toEqual([true, true]);
    const p = basculer(js, "pas_dispo");
    expect([p.journee, p.soiree, p.pas_dispo]).toEqual([false, false, true]);
    expect(basculer(p, "journee").pas_dispo).toBe(false);
  });
  it("Aucun désélectionne les autres", () => {
    expect(basculerQualif(["B", "C"], "aucun")).toEqual(["aucun"]);
    expect(basculerQualif(["aucun"], "C")).toEqual(["C"]);
  });
  it("portable FR 06/07 uniquement", () => {
    expect(normaliserTelephone("+33 6 12 34 56 78")).toBe("0612345678");
    expect(normaliserTelephone("01 23 45 67 89")).toBeNull();
  });
  it("résumé « 4 jours disponibles · 2 jours sans réponse »", () => {
    const j = [
      { journee: true }, { soiree: true }, { journee: true }, { journee: true }, { pas_dispo: true }, {}, {},
    ];
    expect(phraseResume(resumeDispos(j))).toBe("4 jours disponibles · 2 jours sans réponse");
  });
  it("message WhatsApp", () => {
    expect(messageWhatsApp("2026-11-09", "2026-11-06T11:00:00Z", "https://x/dispos")).toBe(
      "Salut à tous, les dispos de la semaine prochaine (9 au 15 nov.) c'est ici, 20 secondes : https://x/dispos — Réponse avant vendredi 12 h. Merci !",
    );
  });
  it("filtre permis C dispo jeudi en journée", () => {
    const l = { permis: ["C"], caces: [], jours: { "2026-11-12": { journee: true } } };
    expect(passeFiltreDispos(l, { permis: "C", jour: "2026-11-12", moment: "journee" })).toBe(true);
    expect(passeFiltreDispos(l, { permis: "C", jour: "2026-11-12", moment: "soiree" })).toBe(false);
    expect(passeFiltreDispos({ ...l, permis: ["B"] }, { permis: "C" })).toBe(false);
  });
});
