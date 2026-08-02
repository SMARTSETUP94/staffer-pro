import {
  actionCarte, describe, it, expect } from "vitest";
import {
  etapeCourante,
  tamponsPour,
  trierCartes,
  grouperParColonne,
  totauxColonne,
  pastille,
  heuresPourEtape,
  type EtapeLite,
  type ObjetCarte,
} from "@/lib/atelier-board";

const e = (
  type: EtapeLite["type_etape"],
  statut: EtapeLite["statut"],
  extra: Partial<EtapeLite> = {},
): EtapeLite => ({
  id: `${type}-id`,
  objet_id: "o1",
  type_etape: type,
  statut,
  prete: true,
  manques: [],
  ...extra,
});

const carte = (over: Partial<ObjetCarte>): ObjetCarte => ({
  objet_id: "o1",
  reference: "1.1",
  nom: "Caisson",
  affaire_id: "a1",
  affaire_numero: "5001",
  affaire_nom: "Chantier",
  date_montage: null,
  respo_fab_id: null,
  etape: e("respo_fab", "a_faire"),
  heures: 0,
  tampons: [],
  ...over,
});

describe("etapeCourante", () => {
  it("prend la première étape applicable non validée", () => {
    const etapes = [e("be", "termine"), e("usinage", "non_applicable"), e("respo_fab", "a_faire")];
    expect(etapeCourante(etapes)?.type_etape).toBe("respo_fab");
  });

  it("ignore les étapes absentes et renvoie null si tout est soldé", () => {
    expect(etapeCourante([e("be", "termine"), e("manutention", "non_applicable")])).toBeNull();
  });

  it("une étape en_attente_validation reste l'étape courante", () => {
    expect(etapeCourante([e("be", "en_attente_validation")])?.type_etape).toBe("be");
  });
});

describe("tamponsPour", () => {
  it("marque validé / non applicable / courant / à venir / absent", () => {
    const etapes = [
      e("be", "termine"),
      e("usinage", "non_applicable"),
      e("respo_fab", "en_cours"),
      e("finition", "a_faire"),
    ];
    const courante = etapeCourante(etapes)!;
    expect(tamponsPour(etapes, courante.id)).toEqual([
      "valide",
      "non_applicable",
      "courant",
      "a_venir",
      "absent",
    ]);
  });
});

describe("trierCartes", () => {
  it("trie par date de montage, sans date en dernier", () => {
    const out = trierCartes([
      carte({ objet_id: "x", date_montage: null, reference: "9" }),
      carte({ objet_id: "y", date_montage: "2026-09-01", reference: "2" }),
      carte({ objet_id: "z", date_montage: "2026-06-01", reference: "1" }),
    ]);
    expect(out.map((c) => c.objet_id)).toEqual(["z", "y", "x"]);
  });

  it("départage par numéro d'affaire puis référence", () => {
    const out = trierCartes([
      carte({ objet_id: "b", affaire_numero: "5002", reference: "1.1" }),
      carte({ objet_id: "a", affaire_numero: "5001", reference: "1.2" }),
      carte({ objet_id: "c", affaire_numero: "5001", reference: "1.1" }),
    ]);
    expect(out.map((c) => c.objet_id)).toEqual(["c", "a", "b"]);
  });
});

describe("grouperParColonne / totauxColonne", () => {
  it("range chaque carte dans la colonne de son étape courante", () => {
    const g = grouperParColonne([
      carte({ objet_id: "a", etape: e("be", "a_faire"), heures: 3 }),
      carte({ objet_id: "b", etape: e("be", "en_cours"), heures: 2.5 }),
      carte({ objet_id: "c", etape: e("finition", "a_faire"), heures: 4 }),
    ]);
    expect(g.be.map((c) => c.objet_id).sort()).toEqual(["a", "b"]);
    expect(totauxColonne(g.be)).toEqual({ objets: 2, heures: 5.5 });
    expect(totauxColonne(g.usinage)).toEqual({ objets: 0, heures: 0 });
  });
});

describe("pastille", () => {
  it("verte quand prête, ambre avec le premier manque, grise si non applicable", () => {
    expect(pastille(e("usinage", "a_faire")).ton).toBe("ok");
    expect(
      pastille(
        e("usinage", "a_faire", { prete: false, manques: ["Plan technique non publié", "x"] }),
      ),
    ).toEqual({ ton: "manque", label: "Plan technique non publié" });
    expect(pastille(e("manutention", "non_applicable")).ton).toBe("neutre");
  });
});

describe("heuresPourEtape", () => {
  it("agrège les métiers rattachés à l'étape", () => {
    const lignes = [
      { metier_code: "construction", heures: 10 },
      { metier_code: "metallerie", heures: 2.5 },
      { metier_code: "peinture", heures: 4 },
      { metier_code: "inconnu", heures: 99 },
    ];
    expect(heuresPourEtape(lignes, "respo_fab")).toBe(12.5);
    expect(heuresPourEtape(lignes, "finition")).toBe(4);
    expect(heuresPourEtape(lignes, "be")).toBe(0);
  });
});

describe("actionCarte (B-bis — validation en deux temps)", () => {
  const base = { isAdmin: false, isRespoFab: false };

  it("étape à faire → Terminer pour tout le monde", () => {
    const a = actionCarte(etape("usinage", "a_faire"), base);
    expect(a.kind).toBe("terminer");
    expect(a.label).toBe("Terminer");
  });

  it("étape respo_fab → Terminer vaut validation (libellé Valider)", () => {
    expect(actionCarte(etape("respo_fab", "en_cours"), base).label).toBe("Valider");
  });

  it("en attente : le respo_fab valide", () => {
    const a = actionCarte(etape("usinage", "en_attente_validation"), { ...base, isRespoFab: true });
    expect(a.kind).toBe("valider");
  });

  it("en attente : l'admin valide", () => {
    expect(actionCarte(etape("finition", "en_attente_validation"), { ...base, isAdmin: true }).kind).toBe(
      "valider",
    );
  });

  it("en attente : un autre utilisateur ne voit aucune action", () => {
    const a = actionCarte(etape("finition", "en_attente_validation"), base);
    expect(a.kind).toBe("aucune");
    expect(a.label).toBe("En attente de validation");
  });
});
