import {describe,it,expect} from "vitest";
import {chargeHebdomadaire,niveauCharge,proposerPeriodeAtelier,deplacerPeriode} from "../planning-barres";
describe("Planning atelier/BE — règles approuvées",()=>{
  it("exclut le 11 novembre 2026 et répartit 32 heures sur 4 jours",()=>{
    expect(chargeHebdomadaire({debut:"2026-11-09",fin:"2026-11-13",heures:32},"2026-11-09",1)).toEqual({heures:32,capacite:32,ratio:1});
  });
  it("seuils 80 et 100 %",()=>{
    expect(niveauCharge(.79)).toBe("normal");expect(niveauCharge(.8)).toBe("vigilance");expect(niveauCharge(1)).toBe("vigilance");expect(niveauCharge(1.01)).toBe("surcharge");
  });
  it("capacité BE 50 % et capacité inconnue sans faux pourcentage",()=>{
    const p={debut:"2026-11-09",fin:"2026-11-13",heures:16};
    expect(chargeHebdomadaire(p,"2026-11-09",1,50).ratio).toBe(1);
    expect(chargeHebdomadaire(p,"2026-11-09",null).ratio).toBeNull();
  });
  it("termine avant départ, puis montage, avec dix jours ouvrés par défaut",()=>{
    expect(proposerPeriodeAtelier({depart:"2026-11-12",montage:"2026-11-16",heures:null,capacite:null})).toEqual({debut:"2026-10-28",fin:"2026-11-10"});
    expect(proposerPeriodeAtelier({depart:null,montage:"2026-11-16",heures:8,capacite:1})).toEqual({debut:"2026-11-13",fin:"2026-11-13"});
  });
  it("déplacement calé au jour conservant la durée",()=>{
    expect(deplacerPeriode({debut:"2026-11-09",fin:"2026-11-13",heures:32},7)).toEqual({debut:"2026-11-16",fin:"2026-11-20",heures:32});
  });
});