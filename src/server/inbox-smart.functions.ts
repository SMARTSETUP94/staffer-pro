/**
 * Inbox SMART — server fns.
 * `getOutlookFullBody` : récupère le corps complet d'un email Outlook
 * via la gateway connecteur. Cap requise : `inbox_smart.view`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OUTLOOK_GW = "https://connector-gateway.lovable.dev/microsoft_outlook";

export const getOutlookFullBody = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ messageIdOutlook: z.string().min(1).max(512) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Vérifier capability inbox_smart.view
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const userRoles = (roles ?? []).map((r) => r.role as string);
    if (userRoles.length === 0) throw new Response("Forbidden", { status: 403 });

    const { data: caps } = await supabase
      .from("role_capabilities")
      .select("role,capability,granted")
      .eq("capability", "inbox_smart.view")
      .in("role", userRoles);
    const allowed = (caps ?? []).some((c) => c.granted);
    if (!allowed) throw new Response("Forbidden: inbox_smart.view required", { status: 403 });

    const lovableKey = process.env.LOVABLE_API_KEY;
    const connectorKey = process.env.MICROSOFT_OUTLOOK_API_KEY;
    if (!lovableKey || !connectorKey) {
      throw new Response("Missing connector env", { status: 500 });
    }

    const url =
      `${OUTLOOK_GW}/me/messages/${encodeURIComponent(data.messageIdOutlook)}` +
      `?$select=id,subject,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectorKey,
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Response(`Outlook gateway ${res.status}: ${txt.slice(0, 200)}`, {
        status: 502,
      });
    }
    const msg = (await res.json()) as {
      id: string;
      subject?: string;
      body?: { contentType?: string; content?: string };
      from?: { emailAddress?: { name?: string; address?: string } };
      toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
      ccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
      receivedDateTime?: string;
      hasAttachments?: boolean;
    };

    return {
      subject: msg.subject ?? null,
      bodyContentType: (msg.body?.contentType ?? "Text") as "HTML" | "Text",
      bodyContent: msg.body?.content ?? "",
      from: msg.from?.emailAddress ?? null,
      to: (msg.toRecipients ?? []).map((r) => r.emailAddress).filter(Boolean),
      cc: (msg.ccRecipients ?? []).map((r) => r.emailAddress).filter(Boolean),
      receivedDateTime: msg.receivedDateTime ?? null,
      hasAttachments: !!msg.hasAttachments,
    };
  });
