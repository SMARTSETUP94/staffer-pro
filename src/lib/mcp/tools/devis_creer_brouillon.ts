import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisWriteEnabled, runDevisWrite } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_creer_brouillon", title: "Créer un brouillon de devis", description: "Créer le brouillon de devis d'une opportunité depuis un modèle (défaut : modèle par défaut). Refusé si l'affaire a déjà un devis (renvoie son id). Idempotent par cle_externe. Brouillon uniquement. Premier appel : aperçu avant / après sans écriture ; après accord, renvoyer les mêmes arguments avec confirmation_id sous 10 minutes.",
  inputSchema: devisSchemas.devis_creer_brouillon, enabled: ({ appContext }) => devisWriteEnabled(appContext),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runDevisWrite(ctx.appContext, "devis_creer_brouillon", args),
});
