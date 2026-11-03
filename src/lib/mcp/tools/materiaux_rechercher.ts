import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisReadEnabled, readDevis } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "materiaux_rechercher", title: "Rechercher des matériaux", description: "Recherche tolérante dans le catalogue matériaux (mots-clés, famille, épaisseur, fournisseur). Prix d'achat seulement avec le droit coûts.",
  inputSchema: devisSchemas.materiaux_rechercher, enabled: ({ appContext }) => devisReadEnabled(appContext, "materiaux_rechercher"),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => readDevis(ctx.appContext, "materiaux_rechercher", args),
});
