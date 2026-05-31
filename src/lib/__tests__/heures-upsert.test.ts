import { describe, expect, it } from "vitest";
import { buildHeuresSaisiePayload } from "@/lib/heures-upsert";

describe("buildHeuresSaisiePayload", () => {
  const base = {
    employe_id: "e1",
    date: "2026-05-31",
    affaire_id: "a1",
    heures_reelles: 8,
    statut: "brouillon" as const,
  };

  it("remplit les champs obligatoires + null pour les optionnels", () => {
    const p = buildHeuresSaisiePayload(base);
    expect(p.employe_id).toBe("e1");
    expect(p.duree_pause_minutes).toBe(0);
    expect(p.heures_nuit).toBe(0);
    expect(p.commentaire).toBeNull();
    expect(p.etape_chantier).toBeNull();
    expect(p.fabrication_objet_id).toBeNull();
    expect(p.fabrication_etape_type).toBeNull();
    expect(p.statut).toBe("brouillon");
    expect(p.valide_le).toBeUndefined();
  });

  it("renseigne valide_le + valide_par quand statut=valide", () => {
    const p = buildHeuresSaisiePayload({ ...base, statut: "valide", valide_par: "u42" });
    expect(p.statut).toBe("valide");
    expect(p.valide_par).toBe("u42");
    expect(typeof p.valide_le).toBe("string");
  });

  it("transmet etape_chantier pour les 4XXX", () => {
    const p = buildHeuresSaisiePayload({ ...base, etape_chantier: "Montage" });
    expect(p.etape_chantier).toBe("Montage");
  });

  it("transmet fabrication_objet_id + type pour les 5XXX", () => {
    const p = buildHeuresSaisiePayload({
      ...base,
      fabrication_objet_id: "o1",
      fabrication_etape_type: "be",
    });
    expect(p.fabrication_objet_id).toBe("o1");
    expect(p.fabrication_etape_type).toBe("be");
  });

  it("propage heures_nuit override", () => {
    const p = buildHeuresSaisiePayload({ ...base, heures_nuit: 2.5 });
    expect(p.heures_nuit).toBe(2.5);
  });

  it("propage phase_montage_demontage uniquement si défini", () => {
    const p1 = buildHeuresSaisiePayload(base);
    expect("phase_montage_demontage" in p1).toBe(false);
    const p2 = buildHeuresSaisiePayload({ ...base, phase_montage_demontage: "montage" });
    expect(p2.phase_montage_demontage).toBe("montage");
  });
});
