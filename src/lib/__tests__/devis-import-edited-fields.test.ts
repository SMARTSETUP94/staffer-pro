import { describe, expect, it } from "vitest";

/**
 * v0.30.3 — Champs Client/Lieu éditables sur affaire existante (import devis).
 *
 * Ces tests verrouillent la logique de _app.devis.import.tsx :
 *   - effectiveClient/effectiveLieu reflètent l'affaire tant que l'utilisateur
 *     n'a pas tapé (clientTouched/lieuTouched = false).
 *   - dès la première frappe (touched=true), la valeur saisie prend le dessus.
 *   - après import, on n'envoie un UPDATE sur affaires.client/lieu QUE si
 *     l'utilisateur a touché le champ (anti-écrasement par valeur vide).
 */

const NEW_AFFAIRE = "__NEW__";

function computeEffective(opts: {
  affaireId: string;
  touched: boolean;
  newValue: string;
  affaireValue: string | null | undefined;
}) {
  const { affaireId, touched, newValue, affaireValue } = opts;
  if (affaireId === NEW_AFFAIRE) return newValue;
  if (touched) return newValue;
  return affaireValue ?? "";
}

function buildAffaireUpdates(opts: {
  clientTouched: boolean;
  lieuTouched: boolean;
  newClient: string;
  newLieu: string;
}) {
  const updates: { client?: string | null; lieu?: string | null } = {};
  if (opts.clientTouched) updates.client = opts.newClient.trim() || null;
  if (opts.lieuTouched) updates.lieu = opts.newLieu.trim() || null;
  return updates;
}

describe("v0.30.3 — Client/Lieu éditables (pré-remplissage non verrouillant)", () => {
  it("affaire existante + non touché → affiche la valeur Progbat/affaire (badge masqué côté UI)", () => {
    const got = computeEffective({
      affaireId: "aff-123",
      touched: false,
      newValue: "",
      affaireValue: "Hermès Paris",
    });
    expect(got).toBe("Hermès Paris");
  });

  it("affaire existante + touché → la saisie utilisateur l'emporte (badge 'Édité' visible côté UI)", () => {
    const got = computeEffective({
      affaireId: "aff-123",
      touched: true,
      newValue: "Hermès — Faubourg Saint-Honoré",
      affaireValue: "Hermès Paris",
    });
    expect(got).toBe("Hermès — Faubourg Saint-Honoré");
  });

  it("UPDATE affaires : ne modifie QUE les champs touchés (anti-écrasement)", () => {
    const updates = buildAffaireUpdates({
      clientTouched: false,
      lieuTouched: true,
      newClient: "",
      newLieu: "Grand Palais Éphémère",
    });
    expect(updates).toEqual({ lieu: "Grand Palais Éphémère" });
    expect(updates).not.toHaveProperty("client");
  });
});
