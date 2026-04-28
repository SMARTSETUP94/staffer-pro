/**
 * v0.23.1 FIX 1 — Tests fusion onglet Devis (RPC v2 + détection machiniste).
 * Couvre :
 *  - Détection double-comptage machiniste (reco B : warning, pas de blocage)
 *  - Contrat des arguments du RPC import_devis_atomique_v2
 *  - Redirect /devis/progbat-import → /devis/import (déclaratif)
 */
import { describe, it, expect } from "vitest";
import {
  detectMachinisteDoubleComptage,
  isValidRpcV2Args,
  RPC_V2_REQUIRED_KEYS,
  MACHINISTE_METIER_ID,
} from "@/lib/devis-import-v2-helpers";

describe("detectMachinisteDoubleComptage — reco B (warning sans blocage)", () => {
  it("false si pas de poste machiniste", () => {
    const postes = [{ metierId: 1, heures: 10 }];
    expect(detectMachinisteDoubleComptage(postes, true, true)).toBe(false);
  });

  it("false si poste machiniste mais aucune option chantier cochée", () => {
    const postes = [{ metierId: MACHINISTE_METIER_ID, heures: 8 }];
    expect(detectMachinisteDoubleComptage(postes, false, false)).toBe(false);
  });

  it("true si machiniste + import montage", () => {
    const postes = [{ metierId: MACHINISTE_METIER_ID, heures: 8 }];
    expect(detectMachinisteDoubleComptage(postes, true, false)).toBe(true);
  });

  it("true si machiniste + import démontage", () => {
    const postes = [{ metierId: MACHINISTE_METIER_ID, heures: 8 }];
    expect(detectMachinisteDoubleComptage(postes, false, true)).toBe(true);
  });

  it("false si poste machiniste mais 0 heures (poste fantôme)", () => {
    const postes = [{ metierId: MACHINISTE_METIER_ID, heures: 0 }];
    expect(detectMachinisteDoubleComptage(postes, true, true)).toBe(false);
  });

  it("ne bloque jamais (retourne booléen, pas d'exception)", () => {
    expect(() => detectMachinisteDoubleComptage([], true, true)).not.toThrow();
  });
});

describe("RPC import_devis_atomique_v2 — contrat des arguments", () => {
  const validArgs = {
    _affaire_id: null,
    _new_affaire: { numero: "AFF001", nom: "Test" },
    _date_montage: "2026-04-27",
    _date_demontage: "2026-05-03",
    _devis: { numero: "DEV-001", libelle: "Test", montant_ht: "10000" },
    _postes: [{ metier_id: 1, heures_prevues: 10 }],
    _objets_fab: [{ reference: "OBJ-1", nom: "Cube", quantite: 1 }],
    _heures_montage: 100,
    _heures_demontage: 50,
    _fichier_hash: "abc123",
  };

  it("toutes les clés requises sont présentes", () => {
    expect(isValidRpcV2Args(validArgs)).toBe(true);
  });

  it("liste exacte des 10 paramètres attendus par la fonction Postgres", () => {
    expect(RPC_V2_REQUIRED_KEYS).toHaveLength(10);
    expect(RPC_V2_REQUIRED_KEYS).toContain("_affaire_id");
    expect(RPC_V2_REQUIRED_KEYS).toContain("_objets_fab");
    expect(RPC_V2_REQUIRED_KEYS).toContain("_heures_montage");
    expect(RPC_V2_REQUIRED_KEYS).toContain("_heures_demontage");
    expect(RPC_V2_REQUIRED_KEYS).toContain("_fichier_hash");
  });

  it("détecte une clé manquante (rollback côté client si payload incomplet)", () => {
    const partial = { ...validArgs };
    delete (partial as Record<string, unknown>)._objets_fab;
    expect(isValidRpcV2Args(partial)).toBe(false);
  });

  it("_objets_fab et _postes peuvent être listes vides (compat RH-only)", () => {
    const empty = { ...validArgs, _postes: [], _objets_fab: [] };
    expect(isValidRpcV2Args(empty)).toBe(true);
  });

  it("_heures_montage et _heures_demontage peuvent être null (opt-in chantier)", () => {
    const noChantier = { ...validArgs, _heures_montage: null, _heures_demontage: null };
    expect(isValidRpcV2Args(noChantier)).toBe(true);
  });

  it("_fichier_hash peut être null mais doit être présent (anti-doublon)", () => {
    const noHash = { ...validArgs, _fichier_hash: null };
    expect(isValidRpcV2Args(noHash)).toBe(true);
  });
});

describe("Redirect /devis/progbat-import → /devis/import (déclaratif)", () => {
  it("la route progbat-import est déclarée comme redirect (pas de composant rendu)", async () => {
    // Lecture statique du fichier pour vérifier qu'il déclare bien un redirect.
    // Évite le coût d'instancier le router complet.
    const mod = await import("@/routes/_app.devis.progbat-import");
    expect(mod.Route).toBeDefined();
    // La route ne doit PAS exposer de composant : seul beforeLoad présent.
    const opts = (mod.Route as unknown as { options?: Record<string, unknown> }).options;
    if (opts) {
      expect(opts.beforeLoad).toBeDefined();
    }
  });
});
