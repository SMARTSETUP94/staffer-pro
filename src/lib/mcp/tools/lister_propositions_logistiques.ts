import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { v2ReadSchemas } from "../write-schemas";
import { readV2 } from "../v2-read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "lister_propositions_logistiques", title: "Lister les propositions logistiques IA sans les valider", description: "Lister les propositions logistiques IA sans les valider. Lecture seule sous les permissions du compte, pagination limit/cursor.",
 inputSchema: v2ReadSchemas.lister_propositions_logistiques, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readV2(ctx.appContext, "lister_propositions_logistiques", args),
});
