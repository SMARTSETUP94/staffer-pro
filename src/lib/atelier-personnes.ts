import {addDays,diffDays,holidaysRange,isWorkingDay} from "@/lib/staffing/date-utils";
export type PersonneAtelier={id:string;prenom:string;nom:string;origine:"employe"|"dispos";actif:boolean};
export type PresenceAtelier={id:string;affaire_id:string;metier_id:number|null;date:string;employe_id:string|null;dispos_intervenant_id:string|null;badge_atelier:string|null};
export const nomAtelier=(p:Pick<PersonneAtelier,"prenom"|"nom">)=>`${p.prenom} ${p.nom.slice(0,1)}.`.trim();
export const identiteAtelier=(p:PresenceAtelier)=>p.employe_id??p.dispos_intervenant_id??"";
export function joursAtelier(debut:string,fin:string,choisis?:string[]){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(debut)||!/^\d{4}-\d{2}-\d{2}$/.test(fin)||fin<debut||diffDays(debut,fin)>130)return [];
  const holidays=holidaysRange(Number(debut.slice(0,4)),Number(fin.slice(0,4)));
  const jours=choisis??Array.from({length:diffDays(debut,fin)+1},(_,i)=>addDays(debut,i));
  return [...new Set(jours)].filter(j=>j>=debut&&j<=fin&&isWorkingDay(j,holidays)).sort();
}
export function nomsBarre(presences:PresenceAtelier[],personnes:PersonneAtelier[]){
  const ids=[...new Set(presences.map(identiteAtelier))];
  const noms=ids.map(id=>{const p=personnes.find(p=>p.id===id);return p?nomAtelier(p):"Personne";});
  return noms.slice(0,3).join(", ")+(noms.length>3?` · +${noms.length-3}`:"");
}
/** Des jours absents restent de vrais trous, jamais une fausse barre continue. */
export function plagesAtelier(presences:PresenceAtelier[]){
  const groupes=new Map<string,PresenceAtelier[]>();
  for(const p of presences){const key=`${identiteAtelier(p)}:${p.affaire_id}:${p.metier_id}:${p.badge_atelier??""}`;groupes.set(key,[...(groupes.get(key)??[]),p]);}
  const out:{presence:PresenceAtelier;debut:string;fin:string;jours:number}[]=[];
  for(const rows of groupes.values()){
    let current:typeof out[number]|undefined;
    for(const p of rows.sort((a,b)=>a.date.localeCompare(b.date))){
      const joint=current&&joursAtelier(addDays(current.fin,1),p.date).length===1;
      if(current&&joint){current.fin=p.date;current.jours++;}
      else{current={presence:p,debut:p.date,fin:p.date,jours:1};out.push(current);}
    }
  }
  return out;
}