import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisReadEnabled, readDevis } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_charge_be", title: "Charge bureau d'études des devis", description: "Heures BE prévues par les devis des affaires indiquées, en jours de 8 h arrondis à 0,1.",
  inputSchema: devisSchemas.devis_charge_be, enabled: ({ appContext }) => devisReadEnabled(appContext, "devis_charge_be"),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => readDevis(ctx.appContext, "devis_charge_be", args),
});
