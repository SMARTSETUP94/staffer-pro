import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {z} from "zod";
import {joursAtelier,type PersonneAtelier,type PresenceAtelier} from "./atelier-personnes";
export const lirePersonnesAtelier=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).inputValidator((v:{debut:string;fin:string})=>z.object({debut:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),fin:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(v)).handler(async({context,data})=>{
 const db=context.supabase;
 const rights=await Promise.all([db.rpc("planning_atelier_ecriture_autorisee"),db.rpc("user_has_cap",{_cap:"section.affaires"})]);
 if(rights.some(r=>r.error)||!rights.some(r=>r.data===true))throw new Error("Accès refusé");
 const personnes:PersonneAtelier[]=[];
 // Le lecteur terrain garde ses propres droits ; seuls des champs sûrs en sortent.
 const refs=await db.rpc("planning_terrain_references");
 if(!refs.error){const value=refs.data as unknown as {personnes:PersonneAtelier[]};personnes.push(...(value.personnes??[]).map(p=>({id:p.id,prenom:p.prenom,nom:p.nom,origine:p.origine,actif:p.actif})));}
 else {
  const [em,di]=await Promise.all([db.from("employes").select("id,prenom,nom,actif").order("id"),db.from("dispos_intervenants").select("id,prenom,nom,actif").is("employe_id",null).order("id")]);
  if(em.error||di.error)throw new Error("Liste des personnes indisponible");
  personnes.push(...(em.data??[]).map(p=>({...p,origine:"employe" as const})),...(di.data??[]).map(p=>({...p,origine:"dispos" as const})));
 }
 const presences:PresenceAtelier[]=[];
 for(let offset=0;;offset+=500){const r=await db.from("assignations").select("id,affaire_id,metier_id,date,employe_id,dispos_intervenant_id,badge_atelier").eq("pole_planning","atelier").gte("date",data.debut).lte("date",data.fin).order("id").range(offset,offset+499);if(r.error)throw new Error(r.error.message);presences.push(...(r.data??[]));if((r.data?.length??0)<500)break;}
 return {personnes,presences};
});
const change=z.object({affaire:z.string().uuid(),metier:z.number().int(),personne:z.string().uuid(),origine:z.enum(["employe","dispos"]),badge:z.enum(["interim","renfort"]).optional(),debut:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),fin:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),jours:z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),retirer:z.boolean()});
export const modifierPersonneAtelier=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((v:z.infer<typeof change>)=>change.parse(v)).handler(async({context,data})=>{
 const days=joursAtelier(data.debut,data.fin,data.jours);if(!days.length||days.length>130)throw new Error("Choisir entre 1 et 130 jours ouvrés");
 if(data.retirer){let total=0;const ranges=data.jours?days.map(j=>({debut:j,fin:j})):[{debut:data.debut,fin:data.fin}];for(const range of ranges){const r=await context.supabase.rpc("planning_atelier_personne_retirer",{_affaire:data.affaire,_metier:data.metier,_personne:data.personne,_debut:range.debut,_fin:range.fin});if(r.error)throw new Error(r.error.message);total+=r.data??0;}return total;}
 const r=await context.supabase.rpc("planning_atelier_personne_ajouter",{_affaire:data.affaire,_metier:data.metier,_personne:data.personne,_origine:data.origine,_badge:data.badge,_jours:days});if(r.error)throw new Error(r.error.message);return r.data;
});