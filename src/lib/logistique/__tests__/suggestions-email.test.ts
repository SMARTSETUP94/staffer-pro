import { describe, it, expect } from "vitest";
import { completerSuggestionsEmail, type SuggestionLine } from "../suggestions-email";

const l = (type: SuggestionLine["type"], date: string): SuggestionLine => ({ keep: true, type, date, contenu: type, lieu: "Site" });

describe("completerSuggestionsEmail", () => {
  it("montage → chargement J-1 ouvré et conditionnement 2 jours ouvrés avant, décochés sans mention", () => {
    const out = completerSuggestionsEmail([l("montage", "2026-10-28")]);
    expect(out.find((x) => x.type === "chargement")!.keep).toBe(false);
    expect(out.find((x) => x.type === "emballage")!.keep).toBe(false);
  });
  it("montage → étapes atelier cochées quand le mail parle de conditionnement et chargement", () => {
    // mercredi 28/10/2026
    const out = completerSuggestionsEmail([l("montage", "2026-10-28")], undefined, "Merci de prévoir conditionnement et chargement la veille");
    const ch = out.find((x) => x.type === "chargement")!;
    const em = out.find((x) => x.type === "emballage")!;
    expect(ch.date).toBe("2026-10-27");
    expect(em.date).toBe("2026-10-23");
    expect(ch.keep && em.keep).toBe(true);
    expect(ch.lieu).toBe("Atelier");
  });
  it("démontage → déchargement optionnel (décoché) le jour ouvré suivant à l'atelier", () => {
    const out = completerSuggestionsEmail([l("demontage", "2026-10-30")]);
    const d = out.find((x) => x.type === "dechargement")!;
    expect(d.date).toBe("2026-11-02");
    expect(d.keep).toBe(false);
    expect(d.lieu).toBe("Atelier");
  });
  it("ne duplique pas un chargement déjà détecté", () => {
    const out = completerSuggestionsEmail([l("montage", "2026-10-28"), l("chargement", "2026-10-26")]);
    expect(out.filter((x) => x.type === "chargement")).toHaveLength(1);
    expect(out.find((x) => x.type === "emballage")!.date).toBe("2026-10-22");
  });
});
