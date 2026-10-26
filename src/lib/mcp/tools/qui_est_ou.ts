import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "qui_est_ou", title: "Qui est où", description: "Affectations par demi-journée, indisponibilités validées et anomalies ; période maximale de 93 jours.",
 inputSchema: { ...rangeSchema, employe: z.string().uuid().optional(), affaire: z.string().uuid().optional(), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "qui_est_ou", args, () => readData(ctx.appContext, "qui_est_ou", args)),
});
