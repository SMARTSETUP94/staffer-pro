import { describe,it,expect } from 'vitest';
import { personnesStaffees,lignesPlanning } from '../planning-equipes';
const personnes = [{id:'1',nom:'A',prenom:'Paul',origine:'employe' as const},{id:'2',nom:'B',prenom:'Jean',origine:'employe' as const}];
const aff = [{employe_id:'1',dispos_intervenant_id:null,date:'2026-11-09',etape_id:'e',affaire_id:'a'}];
describe('Planning personnes et export',()=>{
 it('affiche uniquement les personnes affectées pendant la semaine',()=>{expect(personnesStaffees(personnes,aff,'2026-11-09','2026-11-15').map(p=>p.id)).toEqual(['1']);});
 it('exclut les personnes affectées uniquement hors semaine',()=>{expect(personnesStaffees(personnes,aff,'2026-11-16','2026-11-22')).toEqual([]);});
 it('exporte le bloc Planning et ses noms dans les six colonnes attendues',()=>{
 const rows=lignesPlanning(['2026-11-09'],[{id:'e',date:'2026-11-09',fin:'2026-11-09',heure:'07:00',type:'montage',numero:'4130',nom:'THE VOICE',lieu:'LENDIT',responsable:'Frédéric'}],aff,personnes,{montage:'Montage'});
 expect(rows[1]).toEqual(['Code','Nom chantier','Responsable','Opération','Adresse','Commentaires']);expect(rows[2]).toEqual(['4130','THE VOICE','Frédéric','Montage','LENDIT','07:00']);expect(rows[3]).toEqual(['A Paul']);
 });
});