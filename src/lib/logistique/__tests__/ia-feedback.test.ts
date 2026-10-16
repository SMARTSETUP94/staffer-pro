import { describe, it, expect } from "vitest";
import { feedbackToPrompt } from "../ia-feedback";

describe("feedbackToPrompt", () => {
  it("signale les propositions écartées et le commentaire", () => {
    const p = feedbackToPrompt([{
      email_subject: "Grande Épicerie Noël 2026",
      propose: [{ type: "montage", date: "2026-10-28", contenu: "Entrée prestataires" }, { type: "montage", date: "2026-10-28", contenu: "Début de pose" }],
      retenu: [{ type: "montage", date: "2026-10-28", contenu: "Début de pose", heure_debut: "23:00" }],
      commentaire: "L'entrée prestataires n'est pas une étape",
    }]);
    expect(p).toContain("Proposé à tort (écarté par l'équipe) : montage 2026-10-28 « Entrée prestataires »");
    expect(p).toContain("montage 2026-10-28 23:00 « Début de pose »");
    expect(p).toContain("L'entrée prestataires n'est pas une étape");
  });
  it("ignore les validations sans changement ni commentaire", () => {
    const l = [{ type: "livraison", date: "2026-10-26", contenu: "Livraison" }];
    expect(feedbackToPrompt([{ email_subject: "x", propose: l, retenu: l, commentaire: null }])).toBe("");
  });
});
