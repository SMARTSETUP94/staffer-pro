import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const src=readFileSync("src/lib/qualite-lecture.functions.ts","utf8");
describe("Lecteur Qualité",()=>{
  it("refuse les non-admins avant toute lecture",()=>{
    expect(src.indexOf('db.rpc("qualite_assert_admin")')).toBeLessThan(src.indexOf('db.from("employes")'));
    expect(src).toContain('if (check.error) throw');
    expect(src).toContain('.middleware([requireSupabaseAuth])');
  });
  it("ne sélectionne ni rémunération ni coûts",()=>{
    expect(src).not.toMatch(/select\([^)]*(taux_horaire|forfait|salaire|prix_achat|cout_revient)/);
    expect(src).not.toContain('select("*")');
    expect(src).not.toContain('supabaseAdmin');
    expect(src).toContain('db.rpc("devis_lire_client"');
  });
});