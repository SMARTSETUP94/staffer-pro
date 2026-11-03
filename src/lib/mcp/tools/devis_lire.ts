import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisReadEnabled, readDevis } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_lire", title: "Lire un devis", description: "Devis complet : zones, objets, commentaires, heures, matériaux, lignes libres, options, remise et totaux. Coûts, prix d'achat et marge seulement si le compte a le droit coûts.",
  inputSchema: devisSchemas.devis_lire, enabled: ({ appContext }) => devisReadEnabled(appContext, "devis_lire"),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => readDevis(ctx.appContext, "devis_lire", args),
});
