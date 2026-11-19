import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisWriteEnabled, runDevisWrite } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_ajouter_photo", title: "Ajouter une image à un objet", description: "Joindre une image ou un plan (JPG, PNG ou PDF, 10 Mo maximum, fichier complet contrôlé : fin JPEG FFD9, bloc PNG IEND, PDF %%EOF) à un objet du brouillon. Sources : onedrive_chemin (chemin relatif sous Staffing/ du OneDrive de smart@setup.paris, ex. 9539/02_entree.jpg) ou onedrive_item_id ; url de partage OneDrive / SharePoint / staffing.setup.paris ; document_id d'une image de la boîte de l'affaire ; fichier_base64 pour les petits fichiers. L'aperçu renvoie fichier_ref : à la confirmation, le mettre à la place du fichier (pas de second envoi). Plusieurs images : devis_ajouter_photos. Brouillon uniquement ; confirmation sous 10 minutes. Ordre de préférence : document_id ou onedrive_chemin d'abord (le fichier ne transite pas par la conversation), url ensuite, fichier_base64 seulement pour de très petits fichiers (un long base64 recopié par un modèle est souvent altéré).",
  inputSchema: devisSchemas.devis_ajouter_photo, enabled: ({ appContext }) => devisWriteEnabled(appContext),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: (args, ctx) => runDevisWrite(ctx.appContext, "devis_ajouter_photo", args),
});
