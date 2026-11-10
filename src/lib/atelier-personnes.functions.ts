import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {z} from "zod";
import {joursAtelier,type PersonneAtelier,type PresenceAtelier} from "./atelier-personnes";
export const lirePersonnesAtelier=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).inputValidator((v:{debut:string;fin:string})=>z.object({debut:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),fin:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(v)).handler(async({context,data})=>{
 const db=context.supabase;
 const rights=await Promise.all([db.rpc("planning_atelier_ecriture_autorisee"),db.rpc("user_has_cap",{_cap:"section.affaires"})]);
 if(rights.some(r=>r.error)||!rights.some(r=>r.data===true))throw new Error("Accès refusé");
 const r=await db.rpc("planning_atelier_personnes_lire",{_debut:data.debut,_fin:data.fin});
 if(r.error)throw new Error("Liste des personnes atelier indisponible");
 return r.data as unknown as {personnes:PersonneAtelier[];presences:PresenceAtelier[]};
});
const change=z.object({affaire:z.string().uuid(),metier:z.number().int(),personne:z.string().uuid(),origine:z.enum(["employe","dispos"]),badge:z.enum(["interim","renfort"]).optional(),debut:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),fin:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),jours:z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),retirer:z.boolean()});
export const modifierPersonneAtelier=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((v:z.infer<typeof change>)=>change.parse(v)).handler(async({context,data})=>{
 const days=joursAtelier(data.debut,data.fin,data.jours);if(!days.length||days.length>130)throw new Error("Choisir entre 1 et 130 jours ouvrés");
 if(data.retirer){let total=0;const ranges=data.jours?days.map(j=>({debut:j,fin:j})):[{debut:data.debut,fin:data.fin}];for(const range of ranges){const r=await context.supabase.rpc("planning_atelier_personne_retirer",{_affaire:data.affaire,_metier:data.metier,_personne:data.personne,_debut:range.debut,_fin:range.fin});if(r.error)throw new Error(r.error.message);total+=r.data??0;}return total;}
 const r=await context.supabase.rpc("planning_atelier_personne_ajouter",{_affaire:data.affaire,_metier:data.metier,_personne:data.personne,_origine:data.origine,_badge:data.badge,_jours:days});if(r.error)throw new Error(r.error.message);return r.data;
});