// Sprint 3b.2 — Carnet sous-traitants

export type SousTraitantType = "transport" | "manutention" | "fabrication" | "autre";

export const SOUS_TRAITANT_TYPE_LABEL: Record<SousTraitantType, string> = {
  transport: "Transport",
  manutention: "Manutention",
  fabrication: "Fabrication",
  autre: "Autre",
};

export interface SousTraitant {
  id: string;
  nom: string;
  type: SousTraitantType;
  contact_nom: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  siret: string | null;
  tarif_jour_eur: number | null;
  tarif_km_eur: number | null;
  notes: string | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface SousTraitantInput {
  nom: string;
  type: SousTraitantType;
  contact_nom?: string | null;
  email?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  siret?: string | null;
  tarif_jour_eur?: number | null;
  tarif_km_eur?: number | null;
  notes?: string | null;
  actif?: boolean;
}

export function validateSousTraitantInput(input: SousTraitantInput): string | null {
  if (!input.nom || !input.nom.trim()) return "Le nom est obligatoire.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return "Email invalide.";
  }
  if (input.siret && !/^\d{14}$/.test(input.siret.replace(/\s/g, ""))) {
    return "SIRET invalide (14 chiffres attendus).";
  }
  if (input.tarif_jour_eur != null && input.tarif_jour_eur < 0) {
    return "Le tarif jour doit être positif.";
  }
  if (input.tarif_km_eur != null && input.tarif_km_eur < 0) {
    return "Le tarif km doit être positif.";
  }
  return null;
}

export function formatTarif(value: number | null | undefined, suffix: string): string {
  if (value == null) return "—";
  return `${value.toFixed(2)} € ${suffix}`;
}
