import { lignesPlanning, type EtapePlanning, type AffectationPlanning, type PersonnePlanning } from './planning-equipes';
import { ETAPE_LABELS } from '@/lib/logistique/etapes';
export async function creerExportPlanning(dates: string[], etapes: EtapePlanning[], affectations: AffectationPlanning[], personnes: PersonnePlanning[]) {
  const module = await import('xlsx-js-style');
  const XLSX = module.default ?? module;
  const rows = lignesPlanning(dates,etapes,affectations,personnes,ETAPE_LABELS);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [18,32,24,22,35,30].map(wch => ({wch}));
  for (const key of Object.keys(sheet)) {
    if(key.startsWith('!')) continue;
    const cell = sheet[key];
    cell.t = 's'; delete cell.f;
    cell.s = { font:{name:'Arial',sz:11},alignment:{vertical:'top',wrapText:true} };
  }
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,sheet,'Planning');
  return new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}