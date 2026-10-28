import { MCP_TYPOLOGIES } from "./typologie";
import { z } from "zod";
import { dateSchema, pageSchema } from "./schemas";
import { ETAPE_TYPES } from "@/lib/logistique/etapes";

export const PROJET_ROLES_MCP = ["charge_affaires", "concepteur", "responsable_projet", "chef_constructeur", "chef_finition", "chef_montage", "chef_demontage"] as const;
const text = z.string().trim().min(1).max(255);
const note = z.string().trim().min(1).max(2000);
const uuid = z.string().uuid();
const nullableDate = dateSchema.nullable().optional();
const nullableText = z.string().max(5000).nullable().optional();
const typologie = z.enum(MCP_TYPOLOGIES);
export const confirmationSchema = { confirmation_id: uuid.optional().describe("Omettre pour obtenir l’aperçu ; renvoyer les mêmes arguments avec cet identifiant après accord humain, sous 10 minutes.") };
export const affaireReference = { affaire_id: uuid.optional(), code: z.string().regex(/^\d{4,5}$/).optional() };
export const chantierPatch = z.object({
  date_montage: nullableDate, date_demontage: nullableDate, lieu: nullableText,
  contact_site_nom: nullableText, contact_site_tel: z.string().max(80).nullable().optional(),
  chef_projet_id: uuid.nullable().optional(), charge_affaires_id: uuid.nullable().optional(), dessinateur_id: uuid.nullable().optional(),
  statut: z.enum(["prospect", "en_cours", "termine", "annule"]).optional(),
  montage_nb_techniciens: z.number().int().min(0).max(32767).nullable().optional(), montage_travail_nuit: z.boolean().optional(),
  montage_nb_semi: z.number().int().min(0).max(32767).nullable().optional(), montage_nb_20m3: z.number().int().min(0).max(32767).nullable().optional(),
  montage_nature_prestation: nullableText, montage_notes: nullableText, notes: nullableText,
}).strict().refine(p => Object.keys(p).length > 0, "Modification vide");
export const opportunitePatch = z.object({
  intitule: text.optional(), description: nullableText, lieu: nullableText, date_montage: nullableDate, date_demontage: nullableDate,
  date_evenement: nullableDate, date_evenement_fin: nullableDate, date_pat: nullableDate, typologie_future: typologie.nullable().optional(),
  ca_estime_ht: z.number().nonnegative().nullable().optional(), charge_affaires_id: uuid.nullable().optional(),
  statut: z.enum(["presque_gagne", "en_attente"]).optional().describe("presque_gagne = accord de principe du client, budget validé oralement, en attente du bon de commande ou de la signature."), motif: note.optional(),
  prochaine_action: note.optional(), echeance: nullableDate, jalon: z.enum(["qualification", "devis_envoye", "negociation"]).optional(),
}).strict().refine(p => Object.keys(p).length > 0, "Modification vide").refine(p => !p.statut || p.statut === "presque_gagne" || Boolean(p.motif), "Motif obligatoire pour en attente");
export const etapePatchShape = {
  type: z.enum(ETAPE_TYPES).optional(), sens: z.enum(["aller", "retour"]).nullable().optional(),
  date_debut: dateSchema.optional(), date_fin: nullableDate, heure_debut: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), heure_fin: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  horaire_libre: nullableText, lieu_libre: nullableText, nb_personnes: z.number().int().min(0).max(32767).nullable().optional(),
  responsable: z.string().max(255).nullable().optional(), vehicule_id: uuid.nullable().optional(), immatriculation_libre: nullableText,
  acces: nullableText, note: nullableText, commentaire_equipe: nullableText,
  statut: z.enum(["propose", "valide", "fait"]).optional(),
};
export const writeSchemas = {
  creer_opportunite: {
    client_id: uuid.optional(), client_nom: text.optional(), creer_client: z.boolean().default(false).describe("Autoriser explicitement la création du client inconnu dans l’aperçu avant confirmation."),
    intitule: text, description: z.string().max(5000).optional(), lieu: text.optional(), date_evenement: dateSchema.optional(), date_montage: dateSchema.optional(), date_demontage: dateSchema.optional(), typologie_future: typologie.optional(), ca_estime_ht: z.number().nonnegative().optional(), charge_affaires_id: uuid.optional(),
    contact: z.object({ nom: text, email: z.string().email().optional(), telephone: z.string().max(80).optional() }).strict().optional(),
    source: z.object({ boite: text, message_id: text, sujet: text.optional() }).strict().optional(), cle_externe: z.string().min(1).max(255).optional(), ...confirmationSchema,
  },
  ajouter_action_opportunite: { ...affaireReference, type: z.enum(["email_envoye", "email_recu", "rdv_planifie", "rdv_realise", "relance_tel", "relance_email", "note_interne", "devis_envoye", "echantillon_presente", "autre"]), note, echeance: dateSchema.optional(), ...confirmationSchema },
  mettre_a_jour_opportunite: { ...affaireReference, champs: opportunitePatch, ...confirmationSchema },
  modifier_chantier: { affaire_id: uuid.optional(), numero: z.string().regex(/^\d{4,5}$/).optional(), champs: chantierPatch, ...confirmationSchema },
  ajouter_note_chantier: { affaire_id: uuid, texte: z.string().trim().min(1).max(5000), ...confirmationSchema },
  creer_etape_logistique: {
    affaire_id: uuid, type: z.enum(ETAPE_TYPES), debut: dateSchema, fin: dateSchema.optional(),
    horaires: z.object({ debut: z.string().regex(/^\d{2}:\d{2}$/).optional(), fin: z.string().regex(/^\d{2}:\d{2}$/).optional(), details: z.string().max(1000).optional() }).strict().optional(),
    vehicule_id: uuid.optional(), location_transporteur: text.optional(), responsable_id: uuid.optional(), responsable: text.optional(), commentaire: note.optional(), lieu: text.optional(), cle_externe: z.string().min(1).max(255).optional(), ...confirmationSchema,
  },
  modifier_etape_logistique: { etape_id: uuid, champs: z.object(etapePatchShape).strict().refine(p => Object.keys(p).length > 0, "Modification vide"), ...confirmationSchema },
  deplacer_etape_logistique: { etape_id: uuid, nouveau_debut: dateSchema, nouvelle_fin: dateSchema.optional(), ...confirmationSchema },
  annuler_etape_logistique: { etape_id: uuid, motif: note, ...confirmationSchema },
  affecter_role_projet: {
    affaire_id: uuid, role: z.enum(PROJET_ROLES_MCP), employe_id: uuid.nullable().describe("Employé (fiche employes). null retire le rôle."),
    date_debut: nullableDate, date_fin: nullableDate, cle_externe: z.string().min(1).max(255).optional(), ...confirmationSchema,
  },
} as const;
export const v2ReadSchemas = {
  rechercher_clients: { q: text, ...pageSchema },
  planning_logistique: { du: dateSchema, au: dateSchema, type: z.enum(ETAPE_TYPES).optional(), affaire: uuid.optional(), vehicule: uuid.optional(), ...pageSchema },
  vehicules_disponibles: { du: dateSchema, au: dateSchema, ...pageSchema },
  lister_propositions_logistiques: { affaire_id: uuid.optional(), ...pageSchema },
  planning_pilotage: { du: dateSchema, au: dateSchema, role: z.enum(["concepteur", "responsable_projet"]).optional(), employe: uuid.optional(), ...pageSchema },
} as const;
export type WriteName = keyof typeof writeSchemas;
export type V2ReadName = keyof typeof v2ReadSchemas;