import { describe, it, expect } from "vitest";
import {
  resolveResponsable,
  type AffaireForResponsable,
  type AssignationForResponsable,
  type EmployeForResponsable,
} from "../feuille-route-helpers";

const aff: AffaireForResponsable = {
  id: "aff1",
  chef_projet_id: null,
  charge_affaires_id: null,
};

function emp(id: string, opts: Partial<EmployeForResponsable> = {}): EmployeForResponsable {
  return { id, profile_id: id, est_manutention: false, ...opts };
}

function asg(employe_id: string, est_chef_jour = false): AssignationForResponsable {
  return { affaire_id: "aff1", date: "2026-04-28", employe_id, est_chef_jour };
}

describe("resolveResponsable - fallback 4 niveaux", () => {
  it("1) prend le chef du jour si défini", () => {
    const employes = new Map([["e1", emp("e1")], ["e2", emp("e2", { est_manutention: true })]]);
    const r = resolveResponsable(
      { ...aff, chef_projet_id: "cp1", charge_affaires_id: "ca1" },
      "2026-04-28",
      [asg("e1", true), asg("e2")],
      employes,
    );
    expect(r).toEqual({ id: "e1", source: "chef_du_jour" });
  });

  it("2) fallback sur chef_projet_id si pas de chef du jour", () => {
    const employes = new Map([["e1", emp("e1", { est_manutention: true })]]);
    const r = resolveResponsable(
      { ...aff, chef_projet_id: "cp1", charge_affaires_id: "ca1" },
      "2026-04-28",
      [asg("e1")],
      employes,
    );
    expect(r).toEqual({ id: "cp1", source: "chef_projet" });
  });

  it("3) fallback sur employé manutention staffé si pas de chef projet", () => {
    const employes = new Map([
      ["e1", emp("e1")],
      ["e2", emp("e2", { est_manutention: true })],
    ]);
    const r = resolveResponsable(
      { ...aff, charge_affaires_id: "ca1" },
      "2026-04-28",
      [asg("e1"), asg("e2")],
      employes,
    );
    expect(r).toEqual({ id: "e2", source: "manutention" });
  });

  it("4) fallback sur charge_affaires_id en dernier recours", () => {
    const employes = new Map([["e1", emp("e1")]]);
    const r = resolveResponsable(
      { ...aff, charge_affaires_id: "ca1" },
      "2026-04-28",
      [asg("e1")],
      employes,
    );
    expect(r).toEqual({ id: "ca1", source: "charge_affaires" });
  });

  it("5) renvoie null si aucun fallback ne matche", () => {
    const employes = new Map([["e1", emp("e1")]]);
    const r = resolveResponsable(aff, "2026-04-28", [asg("e1")], employes);
    expect(r).toEqual({ id: null, source: null });
  });

  it("ignore les assignations d'autres affaires/dates", () => {
    const employes = new Map([["e1", emp("e1", { est_manutention: true })]]);
    const r = resolveResponsable(
      aff,
      "2026-04-28",
      [
        { affaire_id: "autre", date: "2026-04-28", employe_id: "e1", est_chef_jour: true },
        { affaire_id: "aff1", date: "2026-04-29", employe_id: "e1", est_chef_jour: true },
      ],
      employes,
    );
    expect(r).toEqual({ id: null, source: null });
  });
});
