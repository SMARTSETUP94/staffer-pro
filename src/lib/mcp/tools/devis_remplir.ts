import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisWriteEnabled, runDevisWrite } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_remplir", title: "Remplir un brouillon de devis", description: "Ajouter en une fois, tout ou rien, zones, objets, commentaires, chapitres, options, heures (poste + niveau), matériaux (catalogue ou libellé + prix) et lignes libres ; 300 lignes maximum par appel. Renvoie les totaux recalculés. Brouillon uniquement. Premier appel : aperçu avant / après sans écriture ; après accord, renvoyer les mêmes arguments avec confirmation_id sous 10 minutes.",
  inputSchema: devisSchemas.devis_remplir, enabled: ({ appContext }) => devisWriteEnabled(appContext),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: (args, ctx) => runDevisWrite(ctx.appContext, "devis_remplir", args),
});
