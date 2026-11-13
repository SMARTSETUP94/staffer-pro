import { describe, expect, it } from "vitest";
import { blocsMarkdown, elaguerCoches, fusionNoteClaude, noteApres, separateurNote, NOTE_MAX } from "../note";

const d = new Date("2026-11-13T12:00:00Z");
describe("note des devis", () => {
  it("séparateur daté identique partout", () => {
    expect(separateurNote(d)).toBe("— Mise à jour du 13/11/2026 (Claude) —");
  });
  it("ajouter place le texte en fin, précédé du séparateur", () => {
    expect(noteApres("A", "ajouter", " B ", d)).toBe("A\n\n— Mise à jour du 13/11/2026 (Claude) —\nB");
  });
  it("remplacer remplace", () => {
    expect(noteApres("A", "remplacer", "B", d)).toBe("B");
  });
  it("refuse au-delà de 8 000 caractères, sans tronquer", () => {
    expect(() => noteApres("x".repeat(7990), "ajouter", "yyyy", d)).toThrow(/8 000/);
    expect(NOTE_MAX).toBe(8000);
  });
  it("soumission identique ou déjà à la fin : rien n'est écrit", () => {
    expect(fusionNoteClaude("A\nB", "B", "humain", d).ecrire).toBe(false);
    expect(fusionNoteClaude("A", "A", "mcp", d).ecrire).toBe(false);
  });
  it("soumission après une version humaine : ajout ; sinon remplacement", () => {
    expect(fusionNoteClaude("Humain", "Claude", "humain", d).note).toBe("Humain\n\n— Mise à jour du 13/11/2026 (Claude) —\nClaude");
    expect(fusionNoteClaude("Ancien", "Nouveau", "mcp", d).note).toBe("Nouveau");
  });
  it("les cases disparues de la note sont retirées", () => {
    expect(elaguerCoches("Point un. Point deux.", ["Point un.", "Point trois."])).toEqual(["Point un."]);
  });
  it("markdown simple : listes et gras, sans HTML", () => {
    const b = blocsMarkdown("**Titre** <b>x</b>\n- un\n- deux");
    expect(b[0]).toEqual({ type: "para", segments: [{ gras: true, texte: "Titre" }, { gras: false, texte: " <b>x</b>" }] });
    expect(b[1]).toMatchObject({ type: "liste", ordonnee: false });
  });
});
