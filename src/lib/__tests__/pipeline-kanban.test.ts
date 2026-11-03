import { describe, expect, it } from "vitest";
import { colonneRepliee, dateUtile, estBrouillonClaude, trierCartes } from "../pipeline-kanban";

const now = new Date("2026-11-03T10:00:00");

describe("date utile", () => {
  it("prend le montage avant l'événement et la visite", () => {
    expect(dateUtile({ date_montage: "2026-12-12", date_evenement_debut: "2026-12-14", date_visite_technique: "2026-11-10" }, now)?.libelle).toBe("Montage");
    expect(dateUtile({ date_evenement_debut: "2026-12-14", date_visite_technique: "2026-11-10" }, now)?.libelle).toBe("Événement");
    expect(dateUtile({ date_visite_technique: "2026-11-10" }, now)?.libelle).toBe("Visite");
  });
  it("est en rouge à moins de 15 jours", () => {
    expect(dateUtile({ date_montage: "2026-11-17" }, now)?.proche).toBe(true);
    expect(dateUtile({ date_montage: "2026-11-18" }, now)?.proche).toBe(false);
  });
});

describe("tri urgence", () => {
  const base = { statut_opportunite: "envoye", created_at: "2026-10-01" };
  it("met les retards d'abord puis le montage le plus proche", () => {
    const items = [
      { ...base, id: "loin", date_montage: "2027-01-10" },
      { ...base, id: "proche", date_montage: "2026-11-20" },
      { ...base, id: "retard", next_action_due_le: "2026-11-01", date_montage: "2027-02-01" },
    ];
    expect(trierCartes(items, "urgence", () => null, now).map((i) => i.id)).toEqual(["retard", "proche", "loin"]);
  });
  it("trie par montant décroissant", () => {
    const m: Record<string, number> = { a: 100, b: 9511 };
    expect(trierCartes([{ ...base, id: "a" }, { ...base, id: "b" }], "montant", (id) => m[id], now).map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("repli des colonnes", () => {
  it("replie Gagné, Perdu et Presque gagné vide par défaut", () => {
    expect(colonneRepliee("gagne", 5, {})).toBe(true);
    expect(colonneRepliee("perdu", 5, {})).toBe(true);
    expect(colonneRepliee("presque_gagne", 0, {})).toBe(true);
    expect(colonneRepliee("presque_gagne", 2, {})).toBe(false);
    expect(colonneRepliee("gagne", 5, { gagne: false })).toBe(false);
  });
});

describe("brouillon Claude à relire", () => {
  it("exige un devis Claude non repris, brouillon ou à valider", () => {
    expect(estBrouillonClaude({ cree_par_mcp: true, statut_redaction: "brouillon", modifie_par_humain_le: null })).toBe(true);
    expect(estBrouillonClaude({ cree_par_mcp: true, statut_redaction: "brouillon", modifie_par_humain_le: "2026-11-01" })).toBe(false);
    expect(estBrouillonClaude({ cree_par_mcp: true, statut_redaction: "valide", modifie_par_humain_le: null })).toBe(false);
    expect(estBrouillonClaude({ cree_par_mcp: false, statut_redaction: "brouillon", modifie_par_humain_le: null })).toBe(false);
  });
});
