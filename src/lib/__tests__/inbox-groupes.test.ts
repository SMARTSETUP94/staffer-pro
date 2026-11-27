import { describe, it, expect } from "vitest";
import { grouperInbox } from "@/lib/inbox-groupes";
import type { InboxItem } from "@/lib/inbox";

const it_ = (k: string, source: InboxItem["source"], severity: InboxItem["severity"]): InboxItem => ({
  item_key: k, source, source_id: k, severity, title: k, subtitle: null,
  affaire_id: null, affaire_numero: null, action_route: "/", created_at: "2026-11-27",
});

describe("grouperInbox", () => {
  it("un groupe par catégorie avec son compteur", () => {
    const g = grouperInbox([it_("a", "devis_brouillon", "medium"), it_("b", "devis_brouillon", "medium"), it_("c", "feedback", "high")]);
    expect(g.map((x) => [x.source, x.items.length])).toEqual([["feedback", 1], ["devis_brouillon", 2]]);
    expect(g[0]?.hautes).toBe(1);
  });
});
