import { z } from "zod";

export const NDF_CATEGORIES = [
  { value: "repas", label: "Repas / Restaurant" },
  { value: "carburant", label: "Carburant" },
  { value: "peage_parking", label: "Péage & Parking" },
  { value: "transport", label: "Transport (train, avion, taxi)" },
  { value: "hebergement", label: "Hébergement / Hôtel" },
  { value: "materiel", label: "Matériel & Outillage chantier" },
  { value: "fournitures", label: "Fournitures diverses" },
  { value: "autre", label: "Autre" },
] as const;

export const NDF_TAUX_TVA = [20, 10, 5.5, 0] as const;

export const NDF_STATUTS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  en_attente: { label: "En attente", variant: "secondary" },
  validee: { label: "Validée", variant: "default" },
  rejetee: { label: "Rejetée", variant: "destructive" },
  remboursee: { label: "Remboursée", variant: "outline" },
};

export type NdfStatusFilter = "en_attente" | "validee" | "remboursee" | null;

export function filterNotesByStatus<T extends { statut: string }>(rows: T[], status: NdfStatusFilter): T[] {
  return status === null ? rows : rows.filter((row) => row.statut === status);
}

export function categorieLabel(v: string) {
  return NDF_CATEGORIES.find((c) => c.value === v)?.label ?? v;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Calcule HT et TVA à partir du TTC et du taux (en %). */
export function computeHtTva(ttc: number, taux: number) {
  const ht = round2(ttc / (1 + taux / 100));
  return { ht, tva: round2(ttc - ht) };
}

export const ticketExtractionSchema = z.object({
  fournisseur: z.string().nullable(),
  date_depense: z.string().nullable().describe("Date du ticket au format AAAA-MM-JJ"),
  montant_ttc: z.number().nullable(),
  montant_ht: z.number().nullable(),
  montant_tva: z.number().nullable(),
  taux_tva: z.number().nullable().describe("Taux principal : 20, 10, 5.5 ou 0"),
  categorie: z.enum(["repas", "carburant", "peage_parking", "transport", "hebergement", "materiel", "fournitures", "autre"]).nullable(),
});
export type TicketExtraction = z.infer<typeof ticketExtractionSchema>;

export function formatEur(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
