import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { writeSchemas } from "../write-schemas";
import { runWrite, writeEnabled } from "../write-policy";
import { prepareWrite } from "../write-preview";
export default defineTool.withAppContext<McpAppContext>()({
 name: "affecter_role_projet", title: "Affecter un rôle de l'équipe projet", description: "Affecter (ou retirer avec employe_id=null) une personne à l'un des 7 rôles de l'équipe projet d'une affaire, avec période facultative. Premier appel : aperçu sans écriture. Après accord humain explicite, renvoyer les mêmes arguments avec confirmation_id sous 10 minutes.",
 inputSchema: writeSchemas.affecter_role_projet, enabled: ({ appContext }) => writeEnabled(appContext, "affecter_role_projet"),
 annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => runWrite(ctx.appContext, "affecter_role_projet", args, () => prepareWrite(ctx.appContext, "affecter_role_projet", args)),
});
