import { describe, expect, it } from "vitest";
import { plageHoraire, regrouperEtapesJour, trierEtapesJour, groupeDeplieParDefaut } from "../regroupement";

const e = (id: string, affaire_id: string, o: Partial<{ heure_debut: string | null; heure_fin: string | null; statut: string; date_debut: string; date_fin: string | null; responsable: string }> = {}) => ({
  id, affaire_id, date_debut: "2026-11-02", date_fin: null, statut: "valide", heure_debut: null, heure_fin: null, ...o,
});
const D = "2026-11-02";

describe("regroupement planning logistique", () => {
  it("regroupe par (affaire, jour)", () => {
    const b = regrouperEtapesJour([e("a", "4123"), e("b", "4123"), e("c", "4120")], D, new Set());
    expect(b.map((x) => x.kind)).toEqual(["groupe", "seule"]);
    expect(b[0].kind === "groupe" && b[0].etapes.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("ne mélange jamais deux chantiers", () => {
    const b = regrouperEtapesJour([e("a", "4123"), e("c", "4120"), e("b", "4123"), e("d", "4120")], D, new Set());
    for (const x of b) if (x.kind === "groupe") expect(new Set(x.etapes.map((y) => y.affaire_id)).size).toBe(1);
    expect(b).toHaveLength(2);
  });
  it("trie par heure, sans heure en dernier", () => {
    const t = trierEtapesJour([e("x", "1"), e("b", "1", { heure_debut: "08:00" }), e("a", "1", { heure_debut: "06:45" })]);
    expect(t.map((x) => x.id)).toEqual(["a", "b", "x"]);
  });
  it("calcule la plage horaire de la première à la dernière heure", () => {
    expect(plageHoraire([e("a", "1", { heure_debut: "06:00", heure_fin: "06:30" }), e("b", "1", { heure_debut: "10:00", heure_fin: "14:00" })])).toBe("06h–14h");
    expect(plageHoraire([e("a", "1", { heure_debut: "06:45" }), e("b", "1")])).toBe("06h45");
    expect(plageHoraire([e("a", "1")])).toBeNull();
  });
  it("remonte conflit, proposé et responsables dédoublonnés", () => {
    const [g] = regrouperEtapesJour([e("a", "1", { responsable: "Kader" }), e("b", "1", { statut: "propose", responsable: "Kader" })], D, new Set(["a"]));
    expect(g.kind === "groupe" && [g.conflit, g.propose, g.responsables]).toEqual([true, true, ["Kader"]]);
  });
  it("sans conflit ni proposé : alertes à faux", () => {
    const [g] = regrouperEtapesJour([e("a", "1"), e("b", "1")], D, new Set(["autre"]));
    expect(g.kind === "groupe" && [g.conflit, g.propose]).toEqual([false, false]);
  });
  it("étape multi-jours présente dans l'encart de chaque jour", () => {
    const list = [e("m", "1", { date_fin: "2026-11-03" }), e("x", "1", { date_debut: "2026-11-03" })];
    expect(regrouperEtapesJour(list, "2026-11-02", new Set()).map((b) => b.kind)).toEqual(["seule"]);
    const j2 = regrouperEtapesJour(list, "2026-11-03", new Set());
    expect(j2[0].kind === "groupe" && j2[0].etapes.map((x) => x.id)).toEqual(["m", "x"]);
  });
  it("désactivé : une carte par étape", () => {
    expect(regrouperEtapesJour([e("a", "1"), e("b", "1")], D, new Set(), false).map((b) => b.kind)).toEqual(["seule", "seule"]);
  });
  it("replié au-delà de 3 étapes", () => {
    expect([groupeDeplieParDefaut(3), groupeDeplieParDefaut(4)]).toEqual([true, false]);
  });
});
