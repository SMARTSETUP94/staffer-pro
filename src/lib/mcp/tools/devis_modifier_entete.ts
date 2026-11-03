import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisWriteEnabled, runDevisWrite } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_modifier_entete", title: "Modifier l'en-tête d'un brouillon", description: "Client, contact, client final, intitulé, date et validité, dates clés de l'affaire, remise (montant, pourcentage ou net souhaité). Brouillon uniquement. Premier appel : aperçu avant / après sans écriture ; après accord, renvoyer les mêmes arguments avec confirmation_id sous 10 minutes.",
  inputSchema: devisSchemas.devis_modifier_entete, enabled: ({ appContext }) => devisWriteEnabled(appContext),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runDevisWrite(ctx.appContext, "devis_modifier_entete", args),
});
