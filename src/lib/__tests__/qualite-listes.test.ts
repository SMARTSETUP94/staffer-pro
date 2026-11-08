import { describe,it,expect } from "vitest";
import { trierUrgence,EMPLOYES_PROTEGES,clientsProbables } from "../qualite-listes";
describe("Qualité — règles Gabin",()=>{
  it("priorise date événement puis ancienneté demande",()=>{
    expect(trierUrgence([{id:"sans",evenement:null,demande:"2026-01-01"},{id:"recent",evenement:"2026-11-09",demande:"2026-11-08"},{id:"ancien",evenement:"2026-11-09",demande:"2026-10-01"},{id:"tard",evenement:"2026-11-15",demande:"2026-01-01"}]).map(x=>x.id)).toEqual(["ancien","recent","tard","sans"]);
  });
  it("maintient Français Kévin, Ravi Dylan et Touré Amadou inactifs",()=>{
    expect(EMPLOYES_PROTEGES.has("28370e42-020d-4168-b9ad-fdb89124d6b2")).toBe(true);
    expect(EMPLOYES_PROTEGES.has("a4f657ea-49b8-430b-a3b1-fb000f8afc28")).toBe(true);
    expect(EMPLOYES_PROTEGES.has("9aad1e59-df05-4da8-9c70-cc4e630cc101")).toBe(true);
    expect(EMPLOYES_PROTEGES.has("autre")).toBe(false);
  });
  it("ne rapproche pas deux clients uniquement sur gmail",()=>{
    const a={id:"a",nom:"Alpha",actif:true,siret:null,domaines_email:[],email:"a@gmail.com"};
    expect(clientsProbables(a,{...a,id:"b",nom:"Beta",email:"b@gmail.com"})).toBe(false);
    expect(clientsProbables({...a,siret:"95311689400015"},{...a,id:"b",nom:"Beta",siret:"95311689400023"})).toBe(true);
  });
});