/**
 * Bloc 4 — Inbox unifiée. v0.49 (L4a) : étendue pour `/aujourdhui`.
 *
 * Helpers client pour les RPC `get_inbox_items`, `dismiss_inbox_item`,
 * `get_inbox_count`. La RPC `get_inbox_items` retourne les 4 sources legacy
 * (assignation_refus / divergence / absence_pending / feedback) déjà
 * scope-filtrées via RLS côté SQL.
 *
 * L4a — Types étendus aux 10 sources de la spec L1 §4.1. Les nouvelles
 * sources sont prêtes côté UI (labels, mapping cap) mais leurs queries
 * dédiées seront branchées dans un lot back-end ultérieur. Voir
 * mem://debts/aujourdhui-10-sources-backend.
 */
import { supabase } from "@/integrations/supabase/client";

export type InboxSeverity = "high" | "medium" | "low";

export type InboxSource =
  // Sources legacy (déjà retournées par get_inbox_items)
  | "assignation_refus"
  | "divergence"
  | "absence_pending"
  | "feedback"
  // L4a — sources à brancher (UI prête, queries back-end à venir)
  | "mission_pose"
  | "validation_heures"
  | "be_attente"
  | "devis_brouillon"
  | "opp_action"
  | "echantillons"
  | "plan_lacune"
  | "heures_saisir"
  | "rh_contrats"
  | "alertes_equipe";

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
  mission_pose: "Mission pose",
  validation_heures: "Validation heures",
  be_attente: "BE en attente",
  devis_brouillon: "Devis brouillon",
  opp_action: "Opportunité",
  echantillons: "Échantillons",
  plan_lacune: "Plan lacune",
  heures_saisir: "Heures à saisir",
  rh_contrats: "Contrat RH",
  alertes_equipe: "Alerte équipe",
};

/**
 * L4a — Mapping source → capability requise pour afficher l'item.
 * Un item dont la cap n'est pas accordée à l'utilisateur est masqué côté UI.
 * Les 4 sources legacy n'ont pas de cap dédiée (déjà RLS-scoped).
 */
export const SOURCE_TO_CAP: Partial<Record<InboxSource, string>> = {
  mission_pose: "inbox.mission_pose",
  validation_heures: "inbox.validation_heures",
  be_attente: "inbox.be_attente",
  devis_brouillon: "inbox.devis_brouillon",
  opp_action: "inbox.opp_action",
  echantillons: "inbox.echantillons",
  plan_lacune: "inbox.plan_lacune",
  heures_saisir: "inbox.heures_saisir",
  rh_contrats: "inbox.rh_contrats",
  alertes_equipe: "inbox.alertes_equipe",
};

export const SEVERITY_STYLES: Record<InboxSeverity, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  low: "bg-muted text-muted-foreground border-border",
};
