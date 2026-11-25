import { describe, expect, it } from "vitest";
import { dateGestePermise, numeroProgbatDefinitifValide, refusPassageOpportunite } from "../synchro-opportunite";

describe("synchro opportunité ↔ devis", () => {
  it("refuse Envoyé avec un devis brouillon", () => {
    expect(refusPassageOpportunite("envoye", { statut_redaction: "brouillon", date_envoi: null })).toMatch(/finalisez/);
  });
  it("refuse Envoyé sans date d'envoi", () => {
    expect(refusPassageOpportunite("envoye", { statut_redaction: "valide", date_envoi: null })).toMatch(/Marquer envoyé/);
  });
  it("accepte Envoyé avec un devis envoyé", () => {
    expect(refusPassageOpportunite("envoye", { statut_redaction: "transfere", date_envoi: "2026-11-20" })).toBeNull();
  });
  it("date jamais dans le futur", () => {
    expect(dateGestePermise("2026-11-26", "2026-11-25")).toBe(false);
    expect(dateGestePermise("2026-11-25", "2026-11-25")).toBe(true);
  });
  it("format ProGBat définitif D-AAAAMM-NNNN", () => {
    expect(numeroProgbatDefinitifValide("D-202611-0042")).toBe(true);
    expect(numeroProgbatDefinitifValide("S-202611-0042")).toBe(false);
  });
});
