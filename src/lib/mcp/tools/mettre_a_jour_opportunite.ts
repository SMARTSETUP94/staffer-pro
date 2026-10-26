import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { writeSchemas } from "../write-schemas";
import { runWrite, writeEnabled } from "../write-policy";
import { prepareWrite } from "../write-preview";
export default defineTool.withAppContext<McpAppContext>()({
 name: "mettre_a_jour_opportunite", title: "Mettre à jour une opportunité", description: "Mettre à jour une opportunité avec les droits du compte. Premier appel : aperçu sans écriture métier. Après accord humain explicite, renvoyer les mêmes arguments avec confirmation_id sous 10 minutes. Aucune suppression ni signature.",
 inputSchema: writeSchemas.mettre_a_jour_opportunite, enabled: ({ appContext }) => writeEnabled(appContext, "mettre_a_jour_opportunite"),
 annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => runWrite(ctx.appContext, "mettre_a_jour_opportunite", args, () => prepareWrite(ctx.appContext, "mettre_a_jour_opportunite", args)),
});
