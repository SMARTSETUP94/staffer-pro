import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "drizzle/migrations");
const sql = readdirSync(dir).filter(f => /^003[234]_mcp_v2_close_legacy/.test(f)).map(f => readFileSync(join(dir, f), "utf8")).join("\n");
const SIGNATURES = [
  "archive_affaire(_affaire_id uuid)", "create_opportunite(_client text", "sign_opportunite(_affaire_id uuid, _new_code text, _chef_projet_id uuid",
  "sign_opportunite(_affaire_id uuid, _new_code text)", "sign_opportunite(_affaire_id uuid)", "import_devis_atomique(_affaire_id uuid, _new_affaire jsonb, _date_montage date, _date_demontage date, _devis jsonb, _postes jsonb)",
  "import_devis_atomique(_affaire_id uuid, _new_affaire jsonb, _date_montage date, _date_demontage date, _devis jsonb, _postes jsonb, _fichier_hash text", "import_devis_atomique_v2(", "import_devis_atomique_v3(",
  "import_progbat_atomique(", "cleanup_fabrication_orphelins(", "delete_devis_atomique(", "refresh_affaire_equipe_historique(", "set_vehicule_chauffeurs_autorises(", "upsert_feuille_route_ligne(",
];

describe("legacy RPC closure for MCP OAuth tokens", () => {
  it("redefines each of the 15 signatures explicitly with the guard first", () => {
    for (const sig of SIGNATURES) {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${sig}`);
      expect(start, sig).toBeGreaterThanOrEqual(0);
      const body = sql.slice(start, sql.indexOf("$function$\n;", start));
      expect(body.split("\nBEGIN\n")[1]?.trimStart().startsWith("PERFORM public.mcp_assert_legacy_oauth_write("), sig).toBe(true);
    }
  });
  it("never rewrites function bodies dynamically", () => {
    expect(sql).not.toMatch(/pg_get_functiondef|regexp_replace/);
  });
  it("opens the dispatch context only around confirmed dispatch", () => {
    expect(sql).toMatch(/INSERT INTO public\.mcp_write_dispatch_context[^\n]*\n\s*output:=mcp_dispatch_write[^\n]*\n\s*DELETE FROM public\.mcp_write_dispatch_context/);
  });
  it("blocks direct OAuth writes on the 7 business tables", () => {
    for (const t of ["affaires", "clients", "client_contacts", "opportunite_actions", "opportunite_jalons", "affaire_etapes_logistiques", "affaire_commentaires"])
      for (const op of ["INSERT", "UPDATE", "DELETE"]) expect(sql).toContain(`ON public.${t} AS RESTRICTIVE FOR ${op} TO authenticated`);
  });
  it("preview checks rights without calling the OAuth-refusing write assert", () => {
    const preview = readFileSync(join(process.cwd(), "src/lib/mcp/write-preview.ts"), "utf8");
    expect(preview).toContain('rpc("mcp_preview_assert_affaire"');
    expect(preview).not.toContain('rpc("app_assert_affaire_write"');
  });
});
