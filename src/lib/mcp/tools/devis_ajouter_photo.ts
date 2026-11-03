import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisWriteEnabled, runDevisWrite } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_ajouter_photo", title: "Ajouter une image à un objet", description: "Joindre une image ou un plan (JPG, PNG ou PDF, 10 Mo maximum) à un objet du brouillon. Préférer url : lien https de partage OneDrive / SharePoint, staffing.setup.paris ou stockage de l'application, récupéré par le serveur (type réel contrôlé, redirections hors liste refusées). fichier_base64 reste possible pour les petits fichiers. La source est notée dans la légende. Brouillon uniquement. Premier appel : aperçu sans écriture ; après accord, renvoyer les mêmes arguments avec confirmation_id sous 10 minutes.",
  inputSchema: devisSchemas.devis_ajouter_photo, enabled: ({ appContext }) => devisWriteEnabled(appContext),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: (args, ctx) => runDevisWrite(ctx.appContext, "devis_ajouter_photo", args),
});
