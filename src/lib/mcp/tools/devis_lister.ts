import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisReadEnabled, readDevis } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_lister", title: "Lister les devis", description: "Devis Staffing d'une affaire (affaire_id) ou de toutes les affaires (recherche, statuts) : numéro, version, statut de rédaction, net HT, date d'envoi, rédigé par Claude.",
  inputSchema: devisSchemas.devis_lister, enabled: ({ appContext }) => devisReadEnabled(appContext, "devis_lister"),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => readDevis(ctx.appContext, "devis_lister", args),
});
