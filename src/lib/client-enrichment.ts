import { z } from "zod";

export const clientContactSuggestionSchema = z.object({
  nom: z.string().nullable(),
  prenom: z.string().nullable(),
  fonction: z.string().nullable(),
  email: z.string().nullable(),
  telephone: z.string().nullable(),
  linkedin: z.string().nullable(),
});

export const clientEnrichmentSchema = z.object({
  nom_officiel: z.string().nullable(),
  secteur: z.string().nullable(),
  siret: z.string().nullable(),
  adresse: z.string().nullable(),
  telephone: z.string().nullable(),
  email: z.string().nullable(),
  site_web: z.string().nullable(),
  linkedin: z.string().nullable(),
  description: z.string().nullable(),
  domaines_email: z.array(z.string()).nullable(),
  contacts: z.array(clientContactSuggestionSchema).nullable(),
  sources: z.array(z.string()).nullable(),
});

export type ClientContactSuggestion = z.infer<typeof clientContactSuggestionSchema>;
export type ClientEnrichment = z.infer<typeof clientEnrichmentSchema>;
