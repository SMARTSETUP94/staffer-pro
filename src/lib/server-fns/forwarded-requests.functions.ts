import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { resoudreTransfert } from '@/lib/forwarded-email';
import { doitEcarterSmart, MOTIF_SMART_NON_RELEVEE } from '@/lib/smart-ecartement';
type Message = {id:string;internetMessageId?:string;conversationId?:string;subject?:string;receivedDateTime?:string;from?:{emailAddress?:{address?:string}}};
export const corrigerDemandesTransferees=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {data:admin,error:roleError}=await context.supabase.rpc('is_admin');if(roleError || !admin) throw new Error('Réservé aux administrateurs');
 const {supabase}=context;
 const rows=[];
 for(let offset=0;;offset+=200){const r=await supabase.from('emails_entrants').select('id,source_boite,from_email,from_name,subject,body_full,metadata_ia,transmis_par,conversation_id,internet_message_id,message_id_outlook,received_at,categorie_ia,statut,client_id,contact_id,opportunite_id,candidature_id').in('source_boite',['devis','smart']).order('id').range(offset,offset+199);if(r.error) throw r.error;rows.push(...(r.data ?? []));if((r.data?.length ?? 0)<200)break;}
 const candidates=rows.filter(r=>r.source_boite==='smart' && r.categorie_ia==='opportunite' && (/@(setup\.paris|groupe-smart\.fr)$/i.test(r.from_email) || /^\s*(fw|fwd|tr)\s*:/i.test(r.subject ?? '')));
 const messages:Message[]=[];const errors:string[]=[];
 // Provenance historique uniquement par lecture de la boîte devis, jamais par l'objet seul.
 try{
  const tenant=process.env.MS_GRAPH_TENANT_ID;const client=process.env.MS_GRAPH_CLIENT_ID;const secret=process.env.MS_GRAPH_CLIENT_SECRET;
  if(!tenant || !client || !secret)throw new Error('Lecture Microsoft non configurée : provenance des anciens mails à confirmer.');
  const tr=await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'})});if(!tr.ok)throw new Error('Lecture Microsoft indisponible.');
  const token=(await tr.json() as {access_token:string}).access_token;
  let url:string|undefined='https://graph.microsoft.com/v1.0/users/devis@setup.paris/mailFolders/inbox/messages?$top=100&$select=id,internetMessageId,conversationId,subject,receivedDateTime,from';
  while(url){if(new URL(url).origin!=='https://graph.microsoft.com')throw new Error('Pagination Microsoft refusée');const mr=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!mr.ok)throw new Error('Lecture devis@ indisponible.');const page=await mr.json() as {value:Message[];'@odata.nextLink'?:string};messages.push(...page.value);url=page['@odata.nextLink'];}
 }catch(e){errors.push(e instanceof Error ? e.message:'Lecture Microsoft indisponible');}
 let corrigees=0,nonIdentifiees=0,provenanceConfirmee=0;const aConfirmer:{id:string;objet:string|null}[]=[];
 for(const r of rows){
  if(r.source_boite==='smart' && !candidates.some(c=>c.id===r.id))continue;
  if(r.source_boite==='smart'){
   const matches=messages.filter(m=>m.id===r.message_id_outlook || (!!r.internet_message_id && m.internetMessageId===r.internet_message_id));
   if(matches.length!==1){aConfirmer.push({id:r.id,objet:r.subject});continue;}
   provenanceConfirmee++;
  }
  const patch=resoudreTransfert({...r,source_boite:'devis'});
  if(!patch)continue;
  const {error}=await supabase.from('emails_entrants').update({...patch,source_boite:'devis'}).eq('id',r.id).eq('statut',r.statut);
  if(error){errors.push(`Correction refusée pour ${r.id}`);continue;}
  corrigees++;if(patch.client_a_identifier)nonIdentifiees++;
 }
 // Smart@ n'est plus relevée : les vrais mails smart@ en attente, jamais traités, sont écartés (rien supprimé).
 const ecartes:{id:string;date:string|null;expediteur:string;objet:string|null}[]=[];
 if(errors.length===0){
  for(const r of rows){
   const confirme=r.source_boite==='smart' && messages.some(m=>m.id===r.message_id_outlook || (!!r.internet_message_id && m.internetMessageId===r.internet_message_id));
   if(!doitEcarterSmart(r,confirme))continue;
   const {data,error}=await supabase.from('emails_entrants').update({statut:'dismissed',dismiss_reason:MOTIF_SMART_NON_RELEVEE}).eq('id',r.id).eq('source_boite','smart').eq('statut','pending_review').is('opportunite_id',null).is('client_id',null).is('contact_id',null).is('candidature_id',null).select('id');
   if(error){errors.push(`Écartement refusé pour ${r.id}`);continue;}
   if(data?.length)ecartes.push({id:r.id,date:r.received_at,expediteur:r.from_name ? `${r.from_name} <${r.from_email}>`:r.from_email,objet:r.subject});
  }
 }
 return {corrigees,nonIdentifiees,provenanceConfirmee,aConfirmer,ecartes,errors};
});