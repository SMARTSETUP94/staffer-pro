import { z } from "zod";
export const pageSchema = { limit: z.number().int().min(1).max(100).default(25), cursor: z.string().regex(/^\d{1,8}$/).default("0") };
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, "Date invalide");
export const rangeSchema = { du: dateSchema, au: dateSchema };