import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisWriteEnabled, runDevisWrite } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_ajouter_photo", title: "Ajouter une image à un objet", description: "Joindre une image ou un plan (JPG, PNG ou PDF, 10 Mo maximum, en base64) à un objet du brouillon ; la source est notée dans la légende. Brouillon uniquement. Premier appel : aperçu avant / après sans écriture ; après accord, renvoyer les mêmes arguments avec confirmation_id sous 10 minutes.",
  inputSchema: devisSchemas.devis_ajouter_photo, enabled: ({ appContext }) => devisWriteEnabled(appContext),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: (args, ctx) => runDevisWrite(ctx.appContext, "devis_ajouter_photo", args),
});
