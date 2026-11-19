import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { complementEnabled, complementSchemas, runComplement } from "../ecritures-complementaires";
export default defineTool.withAppContext<McpAppContext>()({
  name: "materiaux_proposer", title: "Proposer un article au catalogue", description: "Proposer un matériau absent du catalogue (désignation, unité, fournisseur, prix d'achat relu sur une offre, source). Crée seulement une proposition à valider par un admin dans Prix proposés, jamais un article actif ; prix enregistré seulement avec le droit coûts. Vérifier d'abord materiaux_rechercher. Aperçu puis confirmation avec les mêmes arguments.",
  inputSchema: complementSchemas.materiaux_proposer, enabled: ({ appContext }) => complementEnabled(appContext, "materiaux_proposer"),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runComplement(ctx.appContext, "materiaux_proposer", args),
});
