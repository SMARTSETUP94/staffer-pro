import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "mon_profil", title: "Mon profil et mes droits", description: "Identité de votre compte, rôles et capabilities effectives ; aucune information RH.",
 inputSchema: {  ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "mon_profil", args, () => readData(ctx.appContext, "mon_profil", args)),
});
