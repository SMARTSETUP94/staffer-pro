import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const lirePlanningSimple=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const db=context.supabase;
  const rights=await Promise.all([db.rpc("planning_atelier_ecriture_autorisee"),db.rpc("user_has_cap",{_cap:"planning.pilotage"}),db.rpc("user_has_cap",{_cap:"section.affaires"})]);
  if(rights.some(r=>r.error)||!rights.some(r=>r.data===true))throw new Error("Accès planning refusé");
  const [aff,metiers,periodes,roles,refs,etapes,devis]=await Promise.all([
    db.from("affaires").select("id,numero,nom,phase,statut,statut_opportunite,date_montage,atelier_date_debut,atelier_date_fin,atelier_heures_prevues").is("archived_at",null).not("statut","in","(termine,annule)").order("numero").limit(1000),
    db.from("metiers").select("id,code,libelle,capacite_jour").order("ordre"),
    db.from("affaire_planning_metier").select("id,affaire_id,metier_id,date_debut,date_fin,heures_prevues").order("id").limit(1000),
    db.from("affaire_roles").select("id,affaire_id,employe_id,date_debut,date_fin").eq("role","concepteur").order("id").limit(1000),
    db.from("role_referents").select("id,employe_id,capacite_be_pct,visible_planning_be,employes(nom,prenom)").eq("role","concepteur").eq("visible_planning_be",true).order("id"),
    db.from("affaire_etapes_logistiques").select("id,affaire_id,type,date_debut").in("type",["chargement","livraison"]).neq("statut","annule").order("date_debut").limit(1000),
    db.from("devis").select("id,affaire_id,numero,version,created_at,statut_redaction").eq("redige_dans_staffing",true).eq("est_modele",false).is("supprime_le",null).order("created_at",{ascending:false}).limit(1000),
  ]);
  for(const r of [aff,metiers,periodes,roles,refs,etapes,devis])if(r.error)throw new Error(r.error.message);
  const ids=(aff.data??[]).map(a=>a.id);
  const be=ids.length?await db.rpc("devis_charge_be",{_affaire_ids:ids}):{data:[],error:null};
  if(be.error)throw new Error(be.error.message);
  const charges:Record<string,{heures:Record<string,number>;be:number;estimation:boolean;numero:string}>={};
  const choisi=new Map<string,NonNullable<typeof devis.data>[number]>();
  for(const a of aff.data??[]){
    const ds=(devis.data??[]).filter(d=>d.affaire_id===a.id);
    const valide=ds.find(d=>["valide","transfere","signe"].includes(d.statut_redaction??""));
    const brouillon=ds.find(d=>["brouillon","a_valider"].includes(d.statut_redaction??""));
    const d=valide??brouillon;if(d)choisi.set(a.id,d);
  }
  const entries=[...choisi.entries()];
  for(let i=0;i<entries.length;i+=5)await Promise.all(entries.slice(i,i+5).map(async([id,d])=>{
    const r=await db.rpc("devis_lire",{_devis_id:d.id});if(r.error)throw new Error(`Heures du devis ${d.numero} indisponibles`);
    const value=r.data as unknown as {calcul?:{heures_metier?:Record<string,number>}};
    const h=value.calcul?.heures_metier??{};
    const c=(be.data??[]).find(x=>x.affaire_id===id);
    const hb=c?Number(c.heures_be):await db.rpc("devis_heures_be_net",{_devis_id:d.id}).then(x=>{if(x.error)throw new Error(x.error.message);return Number(x.data??0);});
    charges[id]={heures:Object.fromEntries(Object.entries(h).map(([k,v])=>[k,Number(v)])),be:hb,estimation:!["valide","transfere","signe"].includes(d.statut_redaction??""),numero:d.numero};
  }));
  return {affaires:aff.data??[],metiers:metiers.data??[],periodes:periodes.data??[],roles:roles.data??[],referents:refs.data??[],etapes:etapes.data??[],charges,atelierEdit:rights[0].data===true};
});
export type PlanningSimpleData=Awaited<ReturnType<typeof lirePlanningSimple>>;