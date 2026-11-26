import { describe, expect, it, vi } from "vitest";
import { construireDevisPdf, type DevisClient, type LigneClient } from "../pdf-client";

const tables = vi.hoisted(() => [] as { body?: unknown[] }[]);
vi.mock("jspdf-autotable", async (importOriginal) => {
  const original = await importOriginal<typeof import("jspdf-autotable")>();
  return { ...original, default: (...args: Parameters<typeof original.default>) => {
    tables.push(args[1]);
    return original.default(...args);
  } };
});

const chapitres = [
  { id: "suivi", type: "chapitre_suivi", libelle: "Suivi et plans", heures: 4 },
  { id: "pose", type: "chapitre_pose", libelle: "Pose", heures: 15 },
  { id: "depose", type: "chapitre_depose", libelle: "Dépose", heures: 12 },
];
const lignes: LigneClient[] = chapitres.map((c, ordre) => ({
  id: c.id, type: c.type, libelle: c.libelle, ordre, parent_id: null,
  quantite: 1, descriptif_client: null, longueur_mm: null, largeur_mm: null,
  hauteur_mm: null, finition: null, texte: null, montant: 100, sous_total: 100,
}));
const devis: DevisClient = {
  numero: "TEST-EQUIPE", libelle: null, date_devis: "2026-11-26", validite_jours: 30,
  client: null, client_final: null, contact: null, dates: null, photos: [], lignes,
  total_ht: 300, tva: 60, tva_pct: 20, ttc: 360,
};

describe.each(["detaille", "synthetique"] as const)("Heures équipe — %s", (niveau) => {
  for (const chapitre of chapitres) {
    it(`${chapitre.libelle} conserve ses ${chapitre.heures} heures sans objet enfant`, () => {
      tables.length = 0;
      construireDevisPdf(devis, niveau, {}, { equipe: {
        heuresParLigne: { suivi: 4, pose: 15, depose: 12 }, synthese: [],
      } });
      const row = tables.flatMap((t) => t.body ?? []).find((r) =>
        typeof r === "object" && r !== null && "ligneId" in r && r.ligneId === chapitre.id);
      expect(Array.isArray(row)).toBe(true);
      if (!Array.isArray(row)) throw new Error("Ligne du chapitre absente");
      const last: unknown = row.at(-1);
      const value = typeof last === "object" && last !== null && "content" in last ? last.content : last;
      expect(value).toBe(`${chapitre.heures} h`);
    });
  }
});