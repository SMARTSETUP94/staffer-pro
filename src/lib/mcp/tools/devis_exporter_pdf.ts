import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisReadEnabled, readDevis } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_exporter_pdf", title: "Exporter un devis en PDF",
  description: "PDF client du devis (détaillé ou synthétique, sans heures, coûts ni marge ; filigrane PROJET si non validé) et lien de téléchargement valable 1 h, pour préparer un brouillon d'email. N'envoie rien.",
  inputSchema: devisSchemas.devis_exporter_pdf, enabled: ({ appContext }) => devisReadEnabled(appContext, "devis_exporter_pdf"),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => readDevis(ctx.appContext, "devis_exporter_pdf", args),
});
