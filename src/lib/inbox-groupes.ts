import type { InboxItem, InboxSource } from "@/lib/inbox";

export interface InboxGroupe {
  source: InboxSource;
  items: InboxItem[];
  hautes: number;
}

const RANG = { high: 0, medium: 1, low: 2 } as const;

/** Regroupe les actions par catégorie ; catégories avec actions urgentes d'abord. */
export function grouperInbox(items: InboxItem[]): InboxGroupe[] {
  const map = new Map<InboxSource, InboxItem[]>();
  for (const i of items) {
    const l = map.get(i.source);
    if (l) l.push(i);
    else map.set(i.source, [i]);
  }
  return [...map.entries()]
    .map(([source, list]) => ({
      source,
      items: list,
      hautes: list.filter((i) => i.severity === "high").length,
    }))
    .sort((a, b) => {
      const ra = Math.min(...a.items.map((i) => RANG[i.severity]));
      const rb = Math.min(...b.items.map((i) => RANG[i.severity]));
      return ra - rb || b.items.length - a.items.length;
    });
}
