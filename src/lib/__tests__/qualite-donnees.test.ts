import { describe, expect, it } from "vitest";
import { cleNomQualite, candidatsHomonymes, pairesDoublons, diffDisposEmploye, caPropose } from "../qualite-donnees";

describe("qualité des données — rapprochement des noms", () => {
  it("accents, ordre inversé et tirets donnent la même clé", () => {
    expect(cleNomQualite("Kévin", "ETRILLARD")).toBe(cleNomQualite("etrillard", "kevin"));
    expect(cleNomQualite("Jean-Pierre", "Touré")).toBe(cleNomQualite("TOURE", "Jean Pierre"));
  });
  it("candidats : homonyme trouvé, refus « pas la même personne » exclu", () => {
    const emp = [{ id: "a", prenom: "Amadou", nom: "Touré" }, { id: "b", prenom: "Dylan", nom: "Ravi" }];
    expect(candidatsHomonymes({ id: "d", prenom: "TOURE", nom: "amadou" }, emp).map((e) => e.id)).toEqual(["a"]);
    expect(candidatsHomonymes({ id: "d", prenom: "TOURE", nom: "amadou" }, emp, ["a"])).toEqual([]);
  });
  it("doublons : une paire par couple", () => {
    const l = [{ id: "1", prenom: "Léa", nom: "Martin" }, { id: "2", prenom: "MARTIN", nom: "Lea" }, { id: "3", prenom: "Zoé", nom: "X" }];
    expect(pairesDoublons(l).map(([a, b]) => `${a.id}-${b.id}`)).toEqual(["1-2"]);
  });
});

describe("qualité des données — diff Dispos → employé", () => {
  const emp = { telephone: "+33 6 12 34 56 78", categories_permis: ["B"], poste_principal: "Machiniste", est_chef_equipe_terrain: false };
  it("même téléphone sous deux formats : aucun écart", () => {
    expect(diffDisposEmploye({ telephone: "06 12 34 56 78", permis: null, caces: null, poste_terrain: null, est_chef_equipe_terrain: null }, emp)).toEqual([]);
  });
  it("Dispos fait foi sur permis, poste et chef ; rien sur contrat ou taux", () => {
    const d = diffDisposEmploye({ telephone: null, permis: ["B", "C"], caces: ["R489"], poste_terrain: "Chef machiniste", est_chef_equipe_terrain: true }, emp);
    expect(d.map((x) => x.champ)).toEqual(["permis", "poste", "chef"]);
    expect(JSON.stringify(d)).not.toMatch(/taux|forfait|contrat|salaire/);
  });
});

describe("qualité des données — CA depuis devis", () => {
  it("net HT du devis le plus récent non supprimé", () => {
    expect(caPropose([
      { cree_le: "2026-10-01", net_ht: 1000 },
      { cree_le: "2026-11-01", net_ht: 3403.34 },
      { cree_le: "2026-11-05", net_ht: 9999, supprime_le: "2026-11-06" },
    ])).toBe(3403.34);
    expect(caPropose([])).toBeNull();
  });
});
