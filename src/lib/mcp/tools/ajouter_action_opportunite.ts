import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { writeSchemas } from "../write-schemas";
import { runWrite, writeEnabled } from "../write-policy";
import { prepareWrite } from "../write-preview";
export default defineTool.withAppContext<McpAppContext>()({
 name: "ajouter_action_opportunite", title: "Ajouter une action opportunité", description: "Ajouter une action opportunité avec les droits du compte. Premier appel : aperçu sans écriture métier. Après accord humain explicite, renvoyer les mêmes arguments avec confirmation_id sous 10 minutes. Aucune suppression ni signature.",
 inputSchema: writeSchemas.ajouter_action_opportunite, enabled: ({ appContext }) => writeEnabled(appContext, "ajouter_action_opportunite"),
 annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => runWrite(ctx.appContext, "ajouter_action_opportunite", args, () => prepareWrite(ctx.appContext, "ajouter_action_opportunite", args)),
});
