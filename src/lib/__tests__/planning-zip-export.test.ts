/**
 * v0.23.1 FIX 2 — Tests export "all-in-one" :
 * Vérifie buildPlanningWorkbookRange (onglets multi-vues + Flotte) et
 * la composition d'un .zip contenant le xlsx + feuille de route.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { addDays } from "date-fns";
import {
  buildPlanningWorkbookRange,
  workbookToBlob,
  type VehiculeRef,
  type TrajetRef,
} from "@/lib/planning-excel-export";
import { feuilleRouteToBlob } from "@/lib/feuille-route-excel";
import type {
  Absence,
  Affaire,
  Assignation,
  ChefRef,
  DevisConsommation,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";

const metiers: Metier[] = [
  { id: 1, code: "construction", libelle: "Construction", couleur: "#000", ordre: 1 },
];

const employes: Employe[] = [
  {
    id: "e1",
    prenom: "Jean",
    nom: "Dupont",
    type_contrat: "CDI",
    sous_type_contrat: null,
    agence_interim: null,
    metier_principal_id: 1,
  },
  {
    id: "e2",
    prenom: "Léa",
    nom: "Martin",
    type_contrat: "Interim",
    sous_type_contrat: null,
    agence_interim: null,
    metier_principal_id: 1,
  },
];

const affaires: Affaire[] = [
  {
    id: "a1",
    numero: "AFF001",
    nom: "Chantier Test",
    lieu: "Paris",
    client: null,
    chef_chantier_id: null,
    date_montage: "2026-04-27",
    date_demontage: "2026-05-03",
    phase: "signe",
    statut: "en_cours",
  },
];

const weekStart = new Date("2026-04-27"); // lundi
const assignations: Assignation[] = [
  {
    id: "as1",
    affaire_id: "a1",
    employe_id: "e1",
    metier_id: 1,
    date: "2026-04-27",
    heures: 8,
    demi_journee: "JOURNEE",
    devis_id: null,
    notes: null,
    statut_confirmation: "non_requise",
  },
  {
    id: "as2",
    affaire_id: "a1",
    employe_id: "e2",
    metier_id: 1,
    date: "2026-04-28",
    heures: 8,
    demi_journee: "JOURNEE",
    devis_id: null,
    notes: null,
    statut_confirmation: "non_requise",
  },
];

const vehicules: VehiculeRef[] = [
  { id: "v1", nom: "Camion 1", immatriculation: "AA-123-BB", type: "VL" },
];

const trajets: TrajetRef[] = [
  {
    id: "t1",
    date: "2026-04-28",
    heure_depart: "07:00",
    vehicule_id: "v1",
    chauffeur_id: "e1",
    adresse_depart: "Setup",
    adresse_arrivee: "Chantier",
    categorie: "chantier",
    statut_soustraitance: "non",
  },
];

const baseOpts = {
  metiers,
  employes,
  affaires,
  assignations,
  consommation: [] as DevisConsommation[],
  absences: [] as Absence[],
  chefsById: new Map<string, ChefRef>(),
};

describe("buildPlanningWorkbookRange — onglets", () => {
  it("retourne null si plage vide", () => {
    expect(buildPlanningWorkbookRange({ ...baseOpts, weekStarts: [] })).toBeNull();
  });

  it("contient CDI-CDD / Intérim / Synthèse / Heures sur 1 semaine", () => {
    const built = buildPlanningWorkbookRange({ ...baseOpts, weekStarts: [weekStart] });
    expect(built).not.toBeNull();
    const names = built!.wb.SheetNames;
    expect(names.some((n) => n.includes("CDI-CDD"))).toBe(true);
    expect(names.some((n) => n.includes("Intérim"))).toBe(true);
    expect(names.some((n) => n.includes("Synthèse"))).toBe(true);
    expect(names.some((n) => n.includes("Heures"))).toBe(true);
  });

  it("ajoute l'onglet Flotte (véhicules) au xlsx multi-vues", () => {
    const built = buildPlanningWorkbookRange({
      ...baseOpts,
      weekStarts: [weekStart],
      vehicules,
      trajets,
    });
    expect(built!.wb.SheetNames.some((n) => n.includes("Flotte"))).toBe(true);
  });

  it("nom du fichier inclut la semaine ISO (S-XX)", () => {
    const built = buildPlanningWorkbookRange({ ...baseOpts, weekStarts: [weekStart] });
    expect(built!.filename).toMatch(/^planning-S\d{2}-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("respecte une plage multi-semaines (4 semaines = 4 sets d'onglets)", () => {
    const weeks = [0, 1, 2, 3].map((i) => addDays(weekStart, i * 7));
    const built = buildPlanningWorkbookRange({ ...baseOpts, weekStarts: weeks });
    const cdiCount = built!.wb.SheetNames.filter((n) => n.includes("CDI-CDD")).length;
    expect(cdiCount).toBe(4);
    expect(built!.filename).toContain("-a-S");
  });
});

describe("workbookToBlob + JSZip — composition zip", () => {
  it("workbookToBlob retourne un Blob xlsx", () => {
    const built = buildPlanningWorkbookRange({ ...baseOpts, weekStarts: [weekStart] });
    const blob = workbookToBlob(built!.wb);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toContain("spreadsheetml");
  });

  it("zip contient planning.xlsx + feuille-route.xlsx avec naming planning-export-{start}-{end}", async () => {
    const built = buildPlanningWorkbookRange({
      ...baseOpts,
      weekStarts: [weekStart],
      vehicules,
      trajets,
    });
    const planningBlob = workbookToBlob(built!.wb);

    const fr = feuilleRouteToBlob({
      dates: [new Date("2026-04-27"), new Date("2026-04-28")],
      affaires: affaires.map((a) => ({ id: a.id, numero: a.numero, nom: a.nom, lieu: a.lieu })),
      employes: employes.map((e) => ({ id: e.id, prenom: e.prenom, nom: e.nom })),
      metiers: metiers.map((m) => ({ id: m.id, libelle: m.libelle })),
      assignations: assignations.map((a) => ({
        affaire_id: a.affaire_id,
        date: a.date,
        employe_id: a.employe_id,
        metier_id: a.metier_id ?? 1,
        type_operation: null,
      })),
      responsables: new Map(),
    });

    const zip = new JSZip();
    zip.file(built!.filename, planningBlob);
    zip.file(fr.filename, fr.blob);

    const startISO = "2026-04-27";
    const endISO = "2026-05-03";
    const expectedZipName = `planning-export-${startISO}-${endISO}.zip`;
    expect(expectedZipName).toMatch(/^planning-export-\d{4}-\d{2}-\d{2}-\d{2}\d{2}-\d{2}\d{2}$|^planning-export-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.zip$/);

    const arr = await zip.generateAsync({ type: "uint8array" });
    expect(arr.byteLength).toBeGreaterThan(0);

    // Relire le zip pour vérifier la présence des deux fichiers
    const reread = await JSZip.loadAsync(arr);
    const names = Object.keys(reread.files);
    expect(names).toContain(built!.filename);
    expect(names).toContain(fr.filename);
    expect(names.some((n) => n.endsWith(".xlsx"))).toBe(true);
  });
});
