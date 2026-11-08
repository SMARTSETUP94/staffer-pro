import { candidatsHomonymes, cleNomQualite, diffDisposEmploye, pairesDoublons } from "./qualite-donnees";
import type { QualiteLecture } from "./qualite-lecture.functions";

export const EMPLOYES_PROTEGES = new Set(["28370e42-020d-4168-b9ad-fdb89124d6b2","a4f657ea-49b8-430b-a3b1-fb000f8afc28","9aad1e59-df05-4da8-9c70-cc4e630cc101"]);
export function trierUrgence<T extends { evenement: string | null; demande: string }>(rows:T[]):T[] {
  return [...rows].sort((a,b)=>(a.evenement ?? "9999").localeCompare(b.evenement ?? "9999") || a.demande.localeCompare(b.demande));
}
export function clientsProbables(a:QualiteLecture["clients"][number], b:QualiteLecture["clients"][number]) {
  const sa=(a.siret ?? "").replace(/\D/g,""), sb=(b.siret ?? "").replace(/\D/g,"");
  const domaines=(c:typeof a)=>[...c.domaines_email,...(c.email?.includes("@")?[c.email.split("@")[1]]:[])].map(x=>x.toLowerCase()).filter(x=>!["gmail.com","outlook.com","hotmail.com","yahoo.fr","orange.fr"].includes(x));
  return (!!cleNomQualite(a.nom) && cleNomQualite(a.nom)===cleNomQualite(b.nom)) || (sa.length>=9 && sb.length>=9 && sa.slice(0,9)===sb.slice(0,9)) || domaines(a).some(d=>domaines(b).includes(d));
}
export function listesQualite(d:QualiteLecture) {
  const lies=new Set(d.dispos.map(x=>x.employe_id));
  const relier=d.dispos.filter(x=>x.actif && !x.employe_id).map(fiche=>({fiche,candidats:candidatsHomonymes(fiche,d.employes,fiche.employes_refuses)}));
  const diffs=d.dispos.filter(x=>x.actif && x.employe_id).flatMap(fiche=>{
    const employe=d.employes.find(x=>x.id===fiche.employe_id);
    if (!employe) return [];
    const champs=diffDisposEmploye(fiche,{...employe,caces:employe.caces.filter(x=>x!=="aucun")},true).filter(x=>x.champ!=="caces" || fiche.caces.some(c=>c!=="aucun"));
    return champs.length?[{fiche,employe,champs}]:[];
  });
  const doublons=pairesDoublons(d.employes);
  const revoir=d.employes.filter(e=>e.actif && !lies.has(e.id) && !d.affectes.includes(e.id));
  const incomplets=d.employes.filter(e=>e.actif && (!e.telephone || !e.poste_principal || !e.statut_contrat));
  const opportunites=d.affaires.filter(a=>a.phase==="opportunite" && !["gagne","perdu"].includes(a.statut_opportunite ?? ""));
  const sansCa=opportunites.filter(a=>!a.ca_estime_ht).map(a=>{
    const dernier=d.devis.filter(x=>x.affaire_id===a.id).sort((x,y)=>y.created_at.localeCompare(x.created_at))[0];
    return {affaire:a,proposition:dernier?.net_ht ?? null,devis:dernier};
  });
  const sansSuivi=opportunites.filter(a=>!a.charge_affaires_id || !d.actions.some(x=>x.affaire_id===a.id && x.prochaine_action_due_le));
  const demandes=d.demandes.filter(x=>x.client_a_identifier || !x.client_id);
  const clients:[typeof d.clients[number],typeof d.clients[number]][]=[];
  for (let i=0;i<d.clients.length;i++) for(let j=i+1;j<d.clients.length;j++) if(clientsProbables(d.clients[i],d.clients[j])) clients.push([d.clients[i],d.clients[j]]);
  const devis=trierUrgence(d.devis.filter(x=>x.cree_par_mcp && ["brouillon","a_valider"].includes(x.statut_redaction ?? "")).map(devis=>{
    const affaire=d.affaires.find(x=>x.id===devis.affaire_id);
    const demande=d.demandes.filter(x=>x.opportunite_id===devis.affaire_id).sort((x,y)=>x.received_at.localeCompare(y.received_at))[0];
    return {devis,affaire,evenement:affaire?.date_evenement_debut ?? affaire?.date_montage ?? null,demande:demande?.received_at ?? devis.created_at};
  }));
  const personnes=relier.length+diffs.length+doublons.length+revoir.length+incomplets.length;
  const commercial=sansCa.length+sansSuivi.length+demandes.length+clients.length;
  return {relier,diffs,doublons,revoir,incomplets,sansCa,sansSuivi,demandes,clients,devis,personnes,commercial,total:personnes+commercial+devis.length};
}