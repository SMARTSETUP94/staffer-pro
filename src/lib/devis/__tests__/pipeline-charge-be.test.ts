import { describe, it, expect } from "vitest";
import { devisPipelineAction, versionSignaturePropose } from "@/lib/devis/pipeline";
import { alerteChargeBe, joursOuvres, proposerPeriodeBe } from "@/lib/devis/charge-be";

describe("bouton devis des vignettes du pipeline", () => {
  const badge = { devis_id: "d", version: 2, statut_redaction: "transfere" as const };
  it("« Créer le devis » en À faire sans devis pour un rédacteur", () => {
    expect(devisPipelineAction({ statut: "a_faire", badge: null, peutRediger: true, flag: true })).toBe("creer");
  });
  it("pas de « Créer » pour un chef d'équipe (sans droit de rédaction)", () => {
    expect(devisPipelineAction({ statut: "a_faire", badge: null, peutRediger: false, flag: true })).toBeNull();
  });
  it("rien si l'onglet Devis n'est pas activé", () => {
    expect(devisPipelineAction({ statut: "a_faire", badge, peutRediger: true, flag: false })).toBeNull();
  });
  it("« Ouvrir le devis » dans les colonnes ouvertes, pas en gagné/perdu", () => {
    expect(devisPipelineAction({ statut: "presque_gagne", badge, peutRediger: false, flag: true })).toBe("ouvrir");
    expect(devisPipelineAction({ statut: "gagne", badge, peutRediger: true, flag: true })).toBeNull();
    expect(devisPipelineAction({ statut: "perdu", badge, peutRediger: true, flag: true })).toBeNull();
  });
});

describe("version proposée à la signature", () => {
  it("prend la dernière envoyée plutôt qu'une validée plus récente", () => {
    const v = versionSignaturePropose([
      { id: "r1", version: 1, statut_redaction: "transfere" },
      { id: "r2", version: 2, statut_redaction: "transfere" },
      { id: "r3", version: 3, statut_redaction: "valide" },
      { id: "r4", version: 4, statut_redaction: "brouillon" },
    ]);
    expect(v?.id).toBe("r2");
  });
});

describe("charge BE", () => {
  it("alerte quand la période concepteur fait 1 j pour une charge de 2 j", () => {
    expect(alerteChargeBe(2, [{ date_debut: "2026-11-02", date_fin: "2026-11-02" }])).toBe("trop_courte");
    expect(alerteChargeBe(2, [])).toBe("aucune_periode");
    expect(alerteChargeBe(2, [{ date_debut: "2026-11-02", date_fin: "2026-11-03" }])).toBeNull();
  });
  it("propose N jours ouvrés finissant la veille du butoir (week-end et 11 novembre exclus)", () => {
    const p = proposerPeriodeBe(2, "2026-11-12", "2026-11-01");
    expect(p).toEqual({ debut: "2026-11-09", fin: "2026-11-10" });
    expect(joursOuvres(p.debut, p.fin)).toBe(2);
  });
  it("3,5 j de charge donne une période de 4 jours ouvrés", () => {
    const p = proposerPeriodeBe(3.5, null, "2026-11-02");
    expect(joursOuvres(p.debut, p.fin)).toBe(4);
  });
});
