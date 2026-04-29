import { z } from "zod";

// Téléphone FR : 10 chiffres avec ou sans espaces, +33, ou international simple
const TELEPHONE_REGEX = /^(?:(?:\+|00)33[\s.-]?(?:\(0\)[\s.-]?)?|0)[1-9](?:[\s.-]?\d{2}){4}$/;
const TELEPHONE_INTL_FALLBACK = /^\+?\d[\d\s.-]{6,20}$/;

export const telephoneSchema = z
  .string()
  .trim()
  .min(1, "Téléphone obligatoire")
  .refine(
    (v) => TELEPHONE_REGEX.test(v) || TELEPHONE_INTL_FALLBACK.test(v),
    "Numéro de téléphone invalide",
  );

export const codePostalSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "Code postal : 5 chiffres");

export const stepRgpdSchema = z.object({
  rgpd_consent: z.literal(true, {
    errorMap: () => ({ message: "Consentement obligatoire pour continuer" }),
  }),
});

export const stepIdentiteSchema = z.object({
  telephone: telephoneSchema,
  date_naissance: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Date invalide"),
  bio_courte: z.string().trim().max(200, "200 caractères max").optional(),
  avatar_url: z.string().url().optional().or(z.literal("")),
});

export const stepProSchema = z.object({
  metier_principal_id: z.number().int().positive().optional().nullable(),
  permis_types: z.array(z.string()).optional(),
  competences_secondaires_ids: z.array(z.number()).optional(),
});

export const stepSecuriteSchema = z.object({
  adresse_rue: z.string().trim().min(1, "Rue obligatoire").max(200),
  adresse_code_postal: codePostalSchema,
  adresse_ville: z.string().trim().min(1, "Ville obligatoire").max(100),
  adresse_pays: z.string().trim().min(1).default("France"),
  contact_urgence_nom: z.string().trim().min(1, "Nom obligatoire").max(100),
  contact_urgence_telephone: telephoneSchema,
  contact_urgence_lien: z
    .enum(["conjoint", "parent", "frere_soeur", "ami", "autre"])
    .optional(),
});

export type StepRgpd = z.infer<typeof stepRgpdSchema>;
export type StepIdentite = z.infer<typeof stepIdentiteSchema>;
export type StepPro = z.infer<typeof stepProSchema>;
export type StepSecurite = z.infer<typeof stepSecuriteSchema>;

export const REQUIRED_PROFILE_FIELDS = [
  "telephone",
  "adresse_rue",
  "adresse_code_postal",
  "adresse_ville",
  "contact_urgence_nom",
  "contact_urgence_telephone",
  "rgpd_consent_at",
] as const;

export type ProfileForCompleteness = Partial<
  Record<(typeof REQUIRED_PROFILE_FIELDS)[number], string | null | undefined>
>;

/** Pourcentage de complétion (0..100) basé sur les champs requis. */
export function computeProfileCompletion(profile: ProfileForCompleteness | null | undefined): number {
  if (!profile) return 0;
  const filled = REQUIRED_PROFILE_FIELDS.filter((k) => {
    const v = profile[k];
    return typeof v === "string" && v.trim().length > 0;
  }).length;
  return Math.round((filled / REQUIRED_PROFILE_FIELDS.length) * 100);
}

/** Miroir TS de la fonction SQL is_profile_complete. */
export function isProfileComplete(profile: ProfileForCompleteness | null | undefined): boolean {
  if (!profile) return false;
  return REQUIRED_PROFILE_FIELDS.every((k) => {
    const v = profile[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}
