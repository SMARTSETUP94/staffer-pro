import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisReadEnabled, readDevis } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_lire", title: "Lire un devis", description: "Lire un devis. Par défaut vue résumée : en-tête, totaux et arbre des lignes (id, type, libellé, quantité, total, nombre d'heures / matériaux / lignes libres / photos). ligne_ids : détail complet de 20 objets au plus. vue = complet : tout le devis (volumineux). Coûts, prix d'achat et marge seulement avec le droit coûts.",
  inputSchema: devisSchemas.devis_lire, enabled: ({ appContext }) => devisReadEnabled(appContext, "devis_lire"),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => readDevis(ctx.appContext, "devis_lire", args),
});
