import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { complementEnabled, complementSchemas, runComplement } from "../ecritures-complementaires";
export default defineTool.withAppContext<McpAppContext>()({
  name: "documents_affaire_televerser", title: "Déposer un document dans une affaire", description: "Ajouter un JPG, PNG ou PDF (10 Mo, fichier complet contrôlé) aux documents d'une affaire, depuis onedrive_chemin (dossier Staffing de smart@), url ou fichier_base64. Doublon détecté par empreinte (renvoie le document existant). Aucune suppression. Premier appel : aperçu sans écriture et fichier_ref ; après accord, renvoyer les mêmes arguments avec fichier_ref et confirmation_id sous 10 minutes.",
  inputSchema: complementSchemas.documents_affaire_televerser, enabled: ({ appContext }) => complementEnabled(appContext, "documents_affaire_televerser"),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runComplement(ctx.appContext, "documents_affaire_televerser", args),
});
