import { describe, it, expect } from "vitest";
import { getCompatibleChauffeurs } from "@/hooks/use-trajets";
import { alerteDate, vehiculeAUneAlerte, type Vehicule } from "@/hooks/use-vehicules";

/* ------------------------------------------------------------------ */
/* getCompatibleChauffeurs                                             */
/* ------------------------------------------------------------------ */

const livreurs = [
  { id: "e1", est_livreur: true, actif: true, prenom: "A", nom: "X" },
  { id: "e2", est_livreur: true, actif: true, prenom: "B", nom: "Y" },
  { id: "e3", est_livreur: false, actif: true, prenom: "C", nom: "Z" }, // pas livreur
  { id: "e4", est_livreur: true, actif: false, prenom: "D", nom: "W" }, // inactif
  { id: "e5", est_livreur: true, actif: true, prenom: "E", nom: "V" },
];

const vehVL: Vehicule = {
  id: "v1",
  nom: "Trafic",
  type: "VL",
  immatriculation: null,
  marque: null,
  modele: null,
  volume_m3: null,
  poids_max_kg: null,
  capacite_passagers: null,
  permis_requis: "B",
  date_controle_technique: null,
  date_prochaine_revision: null,
  date_expiration_assurance: null,
  proprietaire: "interne",
  notes: null,
  actif: true,
  cout_journalier_eur: null,
  fournisseur_location: null,
  created_at: "",
  updated_at: "",
};

const vehPL: Vehicule = { ...vehVL, id: "v2", type: "poids_lourd", permis_requis: "C" };

describe("getCompatibleChauffeurs", () => {
  it("retourne tous les livreurs actifs si aucun véhicule sélectionné", () => {
    const r = getCompatibleChauffeurs(null, livreurs, new Set());
    expect(r.map((x) => x.id)).toEqual(["e1", "e2", "e5"]);
  });

  it("filtre les non-livreurs et inactifs", () => {
    const r = getCompatibleChauffeurs(vehVL, livreurs, new Set());
    expect(r.map((x) => x.id)).not.toContain("e3");
    expect(r.map((x) => x.id)).not.toContain("e4");
  });

  it("VL : tout livreur actif est compatible (pas de filtre par autorisation)", () => {
    const r = getCompatibleChauffeurs(vehVL, livreurs, new Set());
    expect(r.map((x) => x.id)).toEqual(["e1", "e2", "e5"]);
  });

  it("20m³ : tout livreur actif est compatible", () => {
    const veh20 = { ...vehVL, type: "M3_20" as const };
    const r = getCompatibleChauffeurs(veh20, livreurs, new Set());
    expect(r.map((x) => x.id)).toEqual(["e1", "e2", "e5"]);
  });

  it("Poids lourd : seulement les chauffeurs autorisés", () => {
    const autorises = new Set(["e2", "e5"]);
    const r = getCompatibleChauffeurs(vehPL, livreurs, autorises);
    expect(r.map((x) => x.id)).toEqual(["e2", "e5"]);
  });

  it("Poids lourd avec liste vide → aucun chauffeur", () => {
    const r = getCompatibleChauffeurs(vehPL, livreurs, new Set());
    expect(r).toEqual([]);
  });

  it("Poids lourd : un autorisé inactif n'est pas retourné", () => {
    const autorises = new Set(["e4"]); // e4 est est_livreur=true mais actif=false
    const r = getCompatibleChauffeurs(vehPL, livreurs, autorises);
    expect(r).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* alerteDate                                                          */
/* ------------------------------------------------------------------ */

function todayPlus(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("alerteDate", () => {
  it("retourne 'none' si la date est null", () => {
    expect(alerteDate(null)).toBe("none");
  });

  it("retourne 'expired' si date dans le passé", () => {
    expect(alerteDate(todayPlus(-1))).toBe("expired");
    expect(alerteDate(todayPlus(-30))).toBe("expired");
  });

  it("retourne 'warning' à J0 (aujourd'hui)", () => {
    expect(alerteDate(todayPlus(0))).toBe("warning");
  });

  it("retourne 'warning' à J+15 (dans la fenêtre 30j)", () => {
    expect(alerteDate(todayPlus(15))).toBe("warning");
  });

  it("retourne 'warning' à J+30 (limite incluse)", () => {
    expect(alerteDate(todayPlus(30))).toBe("warning");
  });

  it("retourne 'ok' à J+31 (au-delà de la fenêtre)", () => {
    expect(alerteDate(todayPlus(31))).toBe("ok");
  });

  it("retourne 'ok' à J+90", () => {
    expect(alerteDate(todayPlus(90))).toBe("ok");
  });

  it("respecte un seuil personnalisé (60 jours)", () => {
    expect(alerteDate(todayPlus(45), 60)).toBe("warning");
    expect(alerteDate(todayPlus(45), 30)).toBe("ok");
  });
});

describe("vehiculeAUneAlerte", () => {
  const baseVeh: Vehicule = { ...vehVL };

  it("retourne false si aucune date de contrôle/révision/assurance", () => {
    expect(vehiculeAUneAlerte(baseVeh)).toBe(false);
  });

  it("retourne true si CT expiré", () => {
    expect(
      vehiculeAUneAlerte({ ...baseVeh, date_controle_technique: todayPlus(-1) }),
    ).toBe(true);
  });

  it("retourne true si révision dans les 30 jours", () => {
    expect(
      vehiculeAUneAlerte({ ...baseVeh, date_prochaine_revision: todayPlus(10) }),
    ).toBe(true);
  });

  it("retourne true si assurance expire bientôt", () => {
    expect(
      vehiculeAUneAlerte({ ...baseVeh, date_expiration_assurance: todayPlus(0) }),
    ).toBe(true);
  });

  it("retourne false si toutes les dates sont au-delà de 30j", () => {
    expect(
      vehiculeAUneAlerte({
        ...baseVeh,
        date_controle_technique: todayPlus(180),
        date_prochaine_revision: todayPlus(120),
        date_expiration_assurance: todayPlus(365),
      }),
    ).toBe(false);
  });
});
