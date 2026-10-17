import { z } from "zod";

export const clientEmailSuggestionSchema = z.object({
  analyse: z.string(),
  points_a_clarifier: z.array(z.string()),
  reponse: z.string(),
}).strict();

export type ClientEmailSuggestion = z.infer<typeof clientEmailSuggestionSchema>;