import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { writeSchemas } from "../write-schemas";
import { runWrite, writeEnabled } from "../write-policy";
import { prepareWrite } from "../write-preview";
export default defineTool.withAppContext<McpAppContext>()({
 name: "annuler_etape_logistique", title: "Annuler une étape logistique", description: "Annuler une étape logistique avec les droits du compte. Premier appel : aperçu sans écriture métier. Après accord humain explicite, renvoyer les mêmes arguments avec confirmation_id sous 10 minutes. Aucune suppression ni signature.",
 inputSchema: writeSchemas.annuler_etape_logistique, enabled: ({ appContext }) => writeEnabled(appContext, "annuler_etape_logistique"),
 annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => runWrite(ctx.appContext, "annuler_etape_logistique", args, () => prepareWrite(ctx.appContext, "annuler_etape_logistique", args)),
});
