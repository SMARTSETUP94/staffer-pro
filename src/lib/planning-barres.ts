import { addDays,addWorkingDays,diffDays,holidaysRange,isWorkingDay,previousWorkingDay } from "@/lib/staffing/date-utils";
export type PeriodeBarre={debut:string;fin:string;heures:number};
function feries(a:string,b:string){return holidaysRange(Number(a.slice(0,4))-1,Number(b.slice(0,4))+1);}
export function chargeHebdomadaire(barre:PeriodeBarre,lundi:string,capacitePersonnes:number|null,capacitePct=100){
  const holidays=feries(barre.debut,barre.fin);
  let totalJours=0,joursSemaine=0,joursCapacite=0;
  for(let i=0;i<=diffDays(barre.debut,barre.fin);i++){
    const day=addDays(barre.debut,i);
    if(!isWorkingDay(day,holidays))continue;
    totalJours++;
    if(day>=lundi&&day<=addDays(lundi,6))joursSemaine++;
  }
  for(let i=0;i<7;i++)if(isWorkingDay(addDays(lundi,i),holidays))joursCapacite++;
  const heures=totalJours?barre.heures*joursSemaine/totalJours:0;
  const capacite=capacitePersonnes==null?null:capacitePersonnes*8*joursCapacite*capacitePct/100;
  return {heures,capacite,ratio:capacite && capacite>0?heures/capacite:null};
}
export function niveauCharge(ratio:number|null){return ratio==null?"inconnu":ratio<0.8?"normal":ratio<=1?"vigilance":"surcharge";}
export function alerteSurcharge(ratio:number|null){return ratio!==null && ratio>1;}
export function proposerPeriodeAtelier({depart,montage,heures,capacite}:{depart:string|null;montage:string|null;heures:number|null;capacite:number|null}){
  const repere=depart??montage;
  if(!repere)return null;
  const holidays=feries(repere,repere);
  const fin=previousWorkingDay(addDays(repere,-1),holidays);
  const duree=heures && capacite && capacite>0?Math.max(1,Math.ceil(heures/(capacite*8))):10;
  return {debut:addWorkingDays(fin,-(duree-1),holidays),fin};
}
export function deplacerPeriode(barre:PeriodeBarre,jours:number){return {...barre,debut:addDays(barre.debut,jours),fin:addDays(barre.fin,jours)};}