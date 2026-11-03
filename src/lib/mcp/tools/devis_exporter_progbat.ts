import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisReadEnabled, readDevis } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_exporter_progbat", title: "Exporter un devis vers ProGBat",
  description: "Excel d'import ProGBat (une ligne par objet et par chapitre, sans heures par poste, taux, coûts ni marge) et fiche de contrôle (totaux, remise, options, photos), liens valables 1 h. Devis validé par un humain et non transféré ; mode conversation uniquement.",
  inputSchema: devisSchemas.devis_exporter_progbat, enabled: ({ appContext }) => devisReadEnabled(appContext, "devis_exporter_progbat"),
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: (args, ctx) => readDevis(ctx.appContext, "devis_exporter_progbat", args),
});
