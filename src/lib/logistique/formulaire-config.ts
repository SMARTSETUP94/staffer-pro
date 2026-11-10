import { z } from "zod";
import { TYPES_ETAPE } from "./gabarit-demande";

export const CHAMPS_FORMULAIRE = {
  heure_debut: "Heure de début", lieu: "Adresse", contact_sur_place: "Contact sur place",
  vehicule: "Véhicule", nb_personnes: "Nombre de personnes", responsable: "Chef d'équipe", commentaire: "Commentaire",
} as const;
export const configFormulaireSchema = z.object({
  chefs: z.array(z.string().uuid()).max(500).nullable().default(null),
  categories: z.array(z.enum(TYPES_ETAPE)).min(1).default([...TYPES_ETAPE]),
  obligatoires: z.array(z.enum(Object.keys(CHAMPS_FORMULAIRE) as [keyof typeof CHAMPS_FORMULAIRE, ...Array<keyof typeof CHAMPS_FORMULAIRE>])).default([]),
  accueil: z.string().trim().max(1000).default(""),
});
export type ConfigFormulaire = z.infer<typeof configFormulaireSchema>;
export const CONFIG_FORMULAIRE_DEFAUT = configFormulaireSchema.parse({});
export function erreurIntervention(config: ConfigFormulaire, i: Record<string, unknown>): string | null {
  if (!config.categories.includes(i.type as typeof TYPES_ETAPE[number])) return "Catégorie non autorisée";
  if (config.chefs !== null && i.responsable_id && !config.chefs.includes(String(i.responsable_id))) return "Chef d'équipe non proposé";
  for (const k of config.obligatoires) {
    if (k === "nb_personnes" ? !(Number(i[k]) > 0) : !String(i[k] ?? "").trim()) return `${CHAMPS_FORMULAIRE[k]} obligatoire`;
  }
  return null;
}