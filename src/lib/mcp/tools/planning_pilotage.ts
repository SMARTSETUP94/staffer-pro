import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { v2ReadSchemas } from "../write-schemas";
import { readV2 } from "../v2-read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "planning_pilotage", title: "Lire le planning BE / projets", description: "Périodes des concepteurs et responsables projet par affaire (6 mois maximum). charge=potentielle pour les opportunités à faire / envoyées (jamais comptées) ; chevauchement=true si la personne a plusieurs affaires sur la même période. charge_be (lignes concepteur, presque gagné / gagné / signé) = jours et heures de bureau d'étude calculés depuis le devis de référence { jours, heures, devis, etat: previsionnel|confirme }. Lecture seule, pagination limit/cursor.",
 inputSchema: v2ReadSchemas.planning_pilotage, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readV2(ctx.appContext, "planning_pilotage", args),
});
