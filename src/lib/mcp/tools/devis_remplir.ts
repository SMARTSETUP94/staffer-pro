import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { devisSchemas, devisWriteEnabled, runDevisWrite } from "../devis";
export default defineTool.withAppContext<McpAppContext>()({
  name: "devis_remplir", title: "Remplir un brouillon de devis", description: "Remplir ou corriger un brouillon en une fois, tout ou rien (300 éléments maximum par appel) : lignes ajoute zones, objets, commentaires, chapitres, options, heures (poste + niveau), matériaux et lignes libres ; avec ligne_id, complète une ligne existante (libellé, quantité, dimensions, descriptif appliqués ; une heure de même poste + niveau met à jour la ligne existante au lieu d'en créer une seconde) ; modifications corrige des lignes, heures, matériaux ou lignes libres existants ; suppressions les met à la corbeille (restaurable par un humain). En autonomie, modifier ou supprimer n'est permis que sur un brouillon créé par Claude et non repris. Renvoie les totaux recalculés et marge_fiable. Premier appel : aperçu avant / après sans écriture ; après accord, renvoyer les mêmes arguments avec confirmation_id sous 10 minutes.",
  inputSchema: devisSchemas.devis_remplir, enabled: ({ appContext }) => devisWriteEnabled(appContext),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: (args, ctx) => runDevisWrite(ctx.appContext, "devis_remplir", args),
});
