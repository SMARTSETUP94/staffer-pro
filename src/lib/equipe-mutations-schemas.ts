/**
 * Sprint C / Tests — schémas zod partagés pour les mutations équipe.
 * Extrait de src/server/equipe-mutations.functions.ts pour permettre les tests
 * unitaires côté client sans dépendre du runtime serverFn.
 */
import { z } from "zod";

export const PHASE_ENUM = z.enum([
  "commercial_etude",
  "fabrication",
  "logistique",
  "montage",
  "demontage",
]);

export const NOTES_SCHEMA = z.string().trim().max(200).optional().nullable();
export const ROLE_SCHEMA = z.string().trim().max(200).optional().nullable();

export const upsertAffaireEquipeSchema = z.object({
  affaireId: z.string().uuid(),
  employeId: z.string().uuid(),
  phase: PHASE_ENUM,
  roleTerrain: ROLE_SCHEMA,
  notes: NOTES_SCHEMA,
});

export const removeAffaireEquipeSchema = z.object({
  affaireId: z.string().uuid(),
  employeId: z.string().uuid(),
  phase: PHASE_ENUM,
  cascadeObjets: z.boolean().optional().default(false),
});

export const upsertObjetEquipeSchema = z.object({
  objetId: z.string().uuid(),
  employeId: z.string().uuid(),
  notes: NOTES_SCHEMA,
});

export const removeObjetEquipeSchema = z.object({
  objetId: z.string().uuid(),
  employeId: z.string().uuid(),
});
