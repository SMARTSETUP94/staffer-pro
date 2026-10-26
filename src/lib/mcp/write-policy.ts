import { mapTypologieRow } from "./typologie";
import { ToolError } from "@lovable.dev/mcp-js";
import { compactResult, type McpAppContext } from "./policy";
import type { WriteName } from "./write-schemas";

export const WRITE_CAPS: Record<WriteName, string> = {
  creer_opportunite: "action.create_opportunite", ajouter_action_opportunite: "action.edit_opportunite", mettre_a_jour_opportunite: "action.edit_opportunite",
  modifier_chantier: "section.affaires", ajouter_note_chantier: "section.affaires", creer_etape_logistique: "logistique.etape.edit",
  modifier_etape_logistique: "logistique.etape.edit", deplacer_etape_logistique: "logistique.etape.edit", annuler_etape_logistique: "logistique.etape.edit",
};
export function writeEnabled(context: McpAppContext, tool: WriteName) {
  return context.canWrite === true && context.caps.has("api.mcp.write") && context.caps.has(WRITE_CAPS[tool]) && context.writeScopes?.has(WRITE_CAPS[tool]) === true;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export async function argumentsHash(args: Record<string, unknown>) {
  const { confirmation_id: _, ...content } = args;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(content))));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export function safeDiff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const safe = new Set(["date_debut", "date_fin", "date_montage", "date_demontage", "date_evenement_debut", "date_evenement_fin", "statut", "statut_opportunite", "type", "ca_estime_ht", "montage_nb_techniciens", "montage_travail_nuit", "montage_nb_semi", "montage_nb_20m3"]);
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => JSON.stringify(before[k]) !== JSON.stringify(v)).map(([k, v]) => [k, safe.has(k) ? { avant: before[k] ?? null, apres: v } : { modifie: true }]));
}
export interface WritePreview {
  payload: Record<string, unknown>; before: Record<string, unknown>; after: Record<string, unknown>;
  affaireId?: string; etapeId?: string; snapshot?: string; warnings: string[]; duplicates: unknown[];
}
export async function runWrite(context: McpAppContext, name: WriteName, args: Record<string, unknown>, prepare: () => Promise<WritePreview>) {
  try {
    if (!writeEnabled(context, name)) throw new ToolError("Écriture MCP ou droit métier refusé");
    const fresh = await context.db.rpc("mcp_assert_write", { _tool: name });
    if (fresh.error) throw new ToolError("Écriture MCP refusée : droits ou connexion modifiés");
    const hash = await argumentsHash(args);
    // Mappings use only supplied arguments; mutable record snapshots are checked by the locked RPC.
    if (typeof args.confirmation_id === "string") {
      const prepared = await prepare();
      const { data, error } = await context.db.rpc("mcp_execute_write_locked", {
        _confirmation_id: args.confirmation_id, _tool: name, _arguments_hash: hash, _payload: prepared.payload,
        _diff: safeDiff(prepared.before, prepared.after),
      });
      if (error) throw new ToolError("Confirmation indisponible");
      return { ...compactResult(data), ...(data?.error ? { isError: true } : {}) };
    }
    const preview = await prepare();
    const { data, error } = await context.db.rpc("mcp_write_preview", {
      _tool: name, _arguments_hash: hash, _payload: preview.payload, _affaire_id: preview.affaireId ?? null,
      _etape_id: preview.etapeId ?? null, _snapshot: preview.snapshot ?? null, _diff: safeDiff(preview.before, preview.after),
    });
    if (error) throw new ToolError("Aperçu refusé par les droits ou journal indisponible");
    return compactResult({ statut: "preview", avant: mapTypologieRow(preview.before), apres: mapTypologieRow(preview.after), avertissements: preview.warnings, doublons_potentiels: preview.duplicates, ...data });
  } catch (error) {
    const audit = await context.db.from("mcp_audit_log").insert({ user_id: context.userId, client_id: context.clientId, tool: name, statut: "refused", arguments: {} });
    if (audit.error) throw new ToolError("Journal indisponible : écriture interrompue");
    return { ...compactResult({ error: error instanceof ToolError ? error.message : "Écriture indisponible", statut: "refused" }), isError: true };
  }
}