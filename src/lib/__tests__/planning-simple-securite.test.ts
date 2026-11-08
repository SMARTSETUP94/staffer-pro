import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const sql=readFileSync("drizzle/migrations/0105_planning_atelier_protections_ecriture.sql","utf8");
describe("Planning atelier droits approuvés",()=>{
  it("autorise seulement admin, logistique et chef atelier",()=>{
    expect(sql).toContain("has_role(auth.uid(),'admin')");expect(sql).toContain("has_role(auth.uid(),'logistique')");expect(sql).toContain("has_role(auth.uid(),'atelier_chef')");expect(sql).not.toContain("has_role(auth.uid(),'commercial')");
    expect(sql).toContain("auth.jwt()->>'client_id' IS NULL");
  });
  it("bloque suppression et champs globaux directs non autorisés",()=>{
    expect(sql).toContain("FOR DELETE TO authenticated USING (false)");
    expect(sql).toContain("BEFORE UPDATE ON public.affaires");
    expect(sql).not.toMatch(/DELETE FROM/);
  });
});