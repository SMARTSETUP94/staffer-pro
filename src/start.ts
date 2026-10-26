import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { mcpRateLimitMiddleware } from "@/lib/mcp/rate-limit";
export const startInstance = createStart(() => ({ requestMiddleware: [mcpRateLimitMiddleware], functionMiddleware: [attachSupabaseAuth] }));