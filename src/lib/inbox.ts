/**
 * Bloc 4 — Inbox unifiée.
 * Helpers client pour les RPC `get_inbox_items`, `dismiss_inbox_item`, `get_inbox_count`.
 */
import { supabase } from "@/integrations/supabase/client";

export type InboxSeverity = "high" | "medium" | "low";

export type InboxSource =
  | "assignation_refus"
  | "divergence"
  | "absence_pending"
  | "feedback";

export interface InboxItem {
  item_key: string;
  source: InboxSource;
  source_id: string;
  severity: InboxSeverity;
  title: string;
  subtitle: string | null;
  affaire_id: string | null;
  affaire_numero: string | null;
  action_route: string;
  created_at: string;
}

export async function fetchInboxItems(limit = 100): Promise<InboxItem[]> {
  const { data, error } = await supabase.rpc("get_inbox_items", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as InboxItem[];
}

export async function fetchInboxCount(): Promise<number> {
  const { data, error } = await supabase.rpc("get_inbox_count");
  if (error) throw error;
  return (data as number | null) ?? 0;
}

export async function dismissInboxItem(itemKey: string): Promise<void> {
  const { error } = await supabase.rpc("dismiss_inbox_item", { p_item_key: itemKey });
  if (error) throw error;
}

export async function restoreInboxItem(itemKey: string): Promise<void> {
  const { error } = await supabase.rpc("restore_inbox_item", { p_item_key: itemKey });
  if (error) throw error;
}

export const SOURCE_LABELS: Record<InboxSource, string> = {
  assignation_refus: "Refus assignation",
  divergence: "Divergence plan",
  absence_pending: "Absence",
  feedback: "Feedback",
};

export const SEVERITY_STYLES: Record<InboxSeverity, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  low: "bg-muted text-muted-foreground border-border",
};
