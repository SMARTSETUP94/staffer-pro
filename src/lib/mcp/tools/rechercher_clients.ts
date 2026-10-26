import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { v2ReadSchemas } from "../write-schemas";
import { readV2 } from "../v2-read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "rechercher_clients", title: "Rechercher les clients", description: "Rechercher les clients. Lecture seule sous les permissions du compte, pagination limit/cursor.",
 inputSchema: v2ReadSchemas.rechercher_clients, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readV2(ctx.appContext, "rechercher_clients", args),
});
