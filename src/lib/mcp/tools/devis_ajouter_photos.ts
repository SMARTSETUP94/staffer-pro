import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisWriteEnabled, runDevisWrite } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_ajouter_photos", title: "Ajouter plusieurs images à des objets", description: "Joindre 1 à 20 images ou plans (JPG, PNG, PDF ; 10 Mo chacun ; fichier complet contrôlé) à des objets du brouillon, en un seul aperçu et une seule confirmation, tout ou rien. Chaque image a une source : onedrive_chemin (dossier Staffing de smart@), url, document_id ou fichier_base64. L'aperçu renvoie fichiers_ref : à la confirmation, les mettre à la place des fichiers. Brouillon uniquement.",
  inputSchema: devisSchemas.devis_ajouter_photos, enabled: ({ appContext }) => devisWriteEnabled(appContext),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: (args, ctx) => runDevisWrite(ctx.appContext, "devis_ajouter_photos", args),
});
