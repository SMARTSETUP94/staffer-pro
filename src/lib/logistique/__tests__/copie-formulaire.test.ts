import { describe, it, expect } from "vitest";
import { demandeDeCopie, marqueurCopie, objetCopie } from "../copie-formulaire";

const id = "5bd55b92-1111-4222-8333-444455556666";
describe("copie formulaire log@", () => {
  it("reconnaît une copie par objet LOG – et référence", () => {
    expect(demandeDeCopie(objetCopie("6053", "appro", "10/11/2026"), `<p>${marqueurCopie(id)}</p>`)).toBe(id);
  });
  it("ignore un mail libre sans objet LOG –", () => {
    expect(demandeDeCopie("Fw: Re: Demande de prix 6053", marqueurCopie(id))).toBeNull();
  });
  it("ignore un objet LOG – sans référence", () => {
    expect(demandeDeCopie("LOG – 6053 – appro – 10/11", "Bonjour")).toBeNull();
  });
});
