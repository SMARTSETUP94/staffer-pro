import { parse, isValid } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import type { Json } from '@/integrations/supabase/types';

export interface OriginalSender { name: string | null; email: string | null }
export const isInternalSender = (email: string) => /@(setup\.paris|groupe-smart\.fr)$/i.test(email.trim());
export const cleanForwardSubject = (subject: string) => subject.replace(/^\s*((?:fw|fwd|tr)\s*:\s*)+/i,'').trim();
function texte(body: string) {
 return body.replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi,'\n')
 .replace(/<(?![^\s>]*@)[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&nbsp;|&#160;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
}
function adresse(line: string): OriginalSender | null {
 const m=line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/); if(!m) return null;
 return {email:m[0].toLowerCase(),name:line.slice(0,m.index).replace(/[<"']/g,'').trim() || null};
}
function dateOrigine(value: string): string | null {
 const clean=value.trim().replace(/\s+(?:à|at)\s+/gi,' ').replace(/^(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/i,'');
 // Dates avec fuseau explicite : conserver l'instant fourni.
 if(/(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)\s*$/i.test(clean)) {const d=new Date(clean);if(!Number.isNaN(d.getTime())) return d.toISOString();}
 for(const locale of [fr,enUS]) for(const fmt of ['d MMMM yyyy HH:mm','d MMMM yyyy HH:mm:ss','MMMM d, yyyy h:mm a','MMMM d, yyyy HH:mm','dd/MM/yyyy HH:mm','M/d/yyyy h:mm a','yyyy-MM-dd HH:mm']) {
  const d=parse(clean,fmt,new Date(2000,0,1),{locale});if(!isValid(d)) continue;
  // Outlook sans fuseau : interpréter l'heure locale à Paris, indépendamment du serveur.
  const naive=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),d.getHours(),d.getMinutes(),d.getSeconds());
  let ts=naive;
  for(let i=0;i<2;i++){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(ts));const local=Date.parse(parts.replace(' ','T')+'Z');ts=naive-(local-ts);}
  return new Date(ts).toISOString();
 }
 return null;
}
export function extractOriginalMessage(body: string | null | undefined) {
 if(!body) return null;
 const text=texte(body);const lines=text.split(/\r?\n/);const headers: {sender: OriginalSender;date:string|null;subject:string|null;start:number;end:number}[]=[];
 for(let i=0;i<lines.length;i++) {
  const from=lines[i]?.match(/^\s*(?:>\s*)*(?:De|From)\s*:\s*(.*)/i);if(!from) continue;
  const sender=adresse(from[1] ?? '');if(!sender?.email) continue;
  const h={sender,date:null as string|null,subject:null as string|null,start:i,end:lines.length};
  if(headers.length){const prev=headers.at(-1);if(prev)prev.end=i;}
  for(let j=i+1;j<Math.min(lines.length,i+15);j++){
   const line=lines[j] ?? '';if(/^\s*(?:De|From)\s*:/i.test(line)) break;
   const sent=line.match(/^\s*(?:>\s*)*(?:Envoyé|Sent)\s*:\s*(.*)/i);if(sent)h.date=dateOrigine(sent[1] ?? '');
   const subject=line.match(/^\s*(?:>\s*)*(?:Objet|Subject)\s*:\s*(.*)/i);if(subject){h.subject=cleanForwardSubject(subject[1] ?? '');break;}
  }
  headers.push(h);
 }
 const h=headers.find(h=>h.sender.email && !isInternalSender(h.sender.email));if(!h) return null;
 const segment=lines.slice(h.start,h.end).join('\n');const domain=h.sender.email?.split('@')[1] ?? '';
 const generic=/^(gmail\.com|hotmail\.|outlook\.|yahoo\.|icloud\.com|orange\.fr|free\.fr|wanadoo\.fr|live\.)/i.test(domain);
 const signature=segment.match(/(?:Société|Societe|Company)\s*:\s*([^\n]{2,100})/i)?.[1]?.trim();
 return {...h.sender,date:h.date,subject:h.subject,company:signature ?? (generic ? null : domain.split('.')[0] ?? null)};
}
export function extractOriginalSender(body: string | null | undefined): OriginalSender | null {
 const original=extractOriginalMessage(body);return original ? {name:original.name,email:original.email} : null;
}
type EmailTransfert = {from_email:string;from_name:string|null;subject:string|null;body_full:string|null;source_boite:string|null;transmis_par?:string|null;metadata_ia?:unknown};
export function resoudreTransfert(email: EmailTransfert) {
 const metadata=email.metadata_ia && typeof email.metadata_ia==='object' && !Array.isArray(email.metadata_ia) ? email.metadata_ia as Record<string,Json | undefined> : {};
 if(email.source_boite!=='devis' || (!email.transmis_par && !isInternalSender(email.from_email) && !/^\s*(fw|fwd|tr)\s*:/i.test(email.subject ?? ''))) return null;
 const original=extractOriginalMessage(email.body_full);
 const archive=metadata['transfert_original'] ?? {from_email:email.from_email,from_name:email.from_name,subject:email.subject};
 return {transmis_par:email.transmis_par ?? email.from_email,client_a_identifier:!original?.email,
  from_email:original?.email ?? email.from_email,from_name:original?.name ?? (original?.email ? null : email.from_name),subject:original?.subject || cleanForwardSubject(email.subject ?? ''),
  metadata_ia:{...metadata,transfert_original:archive,date_demande_originale:original?.date ?? null,...(original?.company ? {opp_client:original.company} : {} )}};
}