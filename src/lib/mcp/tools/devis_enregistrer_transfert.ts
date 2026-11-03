import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisWriteEnabled, runDevisWrite } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_enregistrer_transfert", title: "Enregistrer le transfert ProGBat",
  description: "Après l'import dans ProGBat : enregistrer le numéro provisoire S… (devis Staffing figé), puis plus tard le numéro définitif D-AAAAMM-NNNN, avec le total HT relu comparé au centime (motif obligatoire si écart). Mode conversation et accord explicite obligatoires. Premier appel : aperçu sans écriture ; après accord, renvoyer les mêmes arguments avec confirmation_id sous 10 minutes.",
  inputSchema: devisSchemas.devis_enregistrer_transfert, enabled: ({ appContext }) => devisWriteEnabled(appContext),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runDevisWrite(ctx.appContext, "devis_enregistrer_transfert", args),
});
