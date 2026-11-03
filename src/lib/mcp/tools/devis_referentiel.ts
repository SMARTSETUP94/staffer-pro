import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisReadEnabled, readDevis } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_referentiel", title: "Référentiel devis", description: "Taux de vente en vigueur par poste et niveau, paramètres (forfaits), modèles actifs et modèle par défaut. Coûts de revient seulement avec le droit coûts.",
  inputSchema: devisSchemas.devis_referentiel, enabled: ({ appContext }) => devisReadEnabled(appContext, "devis_referentiel"),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => readDevis(ctx.appContext, "devis_referentiel", args),
});
