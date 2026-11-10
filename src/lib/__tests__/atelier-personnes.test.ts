import {describe,it,expect} from "vitest";
import {joursAtelier,nomsBarre,plagesAtelier,type PresenceAtelier} from "../atelier-personnes";
const presence=(date:string):PresenceAtelier=>({id:date,date,affaire_id:"a",metier_id:1,employe_id:"p",dispos_intervenant_id:null,badge_atelier:null});
describe("personnes atelier",()=>{
 it("exclut le 11 novembre et le week-end",()=>expect(joursAtelier("2026-11-09","2026-11-15")).toEqual(["2026-11-09","2026-11-10","2026-11-12","2026-11-13"]));
 it("filtre les jours précis et doublons",()=>expect(joursAtelier("2026-11-09","2026-11-15",["2026-11-10","2026-11-10","2026-11-11","2026-11-14"])).toEqual(["2026-11-10"]));
 it("refuse une période inversée ou trop longue",()=>{expect(joursAtelier("2026-11-10","2026-11-09")).toEqual([]);expect(joursAtelier("2026-01-01","2026-12-31")).toEqual([]);});
 it("limite les noms à trois et +N",()=>{const ps=[0,1,2,3].map(i=>({id:String(i),prenom:`P${i}`,nom:"Nom",origine:"employe" as const,actif:true}));expect(nomsBarre(ps.map(p=>({...presence("2026-11-10"),employe_id:p.id})),ps)).toBe("P0 N., P1 N., P2 N. · +1");});
 it("préserve les jours non affectés dans le Gantt",()=>{const r=plagesAtelier([presence("2026-11-09"),presence("2026-11-12")]);expect(r.map(x=>x.jours)).toEqual([1,1]);});
 it("relie une présence autour du férié sans le compter",()=>{const r=plagesAtelier([presence("2026-11-10"),presence("2026-11-12")]);expect(r).toHaveLength(1);expect(r[0]?.jours).toBe(2);});
});