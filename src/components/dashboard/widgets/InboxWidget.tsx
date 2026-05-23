/**
 * Bloc 4 — Widget dashboard "Inbox".
 * Affiche les 5 items les plus prioritaires + badge compteur + lien /inbox.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Inbox, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchInboxItems,
  SOURCE_LABELS,
  SEVERITY_STYLES,
  type InboxItem,
} from "@/lib/inbox";

export function InboxWidget() {
  const [items, setItems] = useState<InboxItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchInboxItems(20);
        if (!cancelled) setItems(list);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = items?.length ?? 0;
  const preview = (items ?? []).slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4 text-primary" />
          Inbox
          {total > 0 && (
            <Badge variant="destructive" className="ml-1 text-[10px]">
              {total}
            </Badge>
          )}
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/inbox">
            Tout voir <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {items === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : preview.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Tout est traité 🎉</p>
        ) : (
          <ul className="divide-y">
            {preview.map((item) => (
              <li key={item.item_key} className="py-2.5">
                <Link
                  to={item.action_route as any}
                  className="block hover:bg-muted/30 rounded-md -mx-2 px-2 py-1"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${SEVERITY_STYLES[item.severity]}`}
                    >
                      {SOURCE_LABELS[item.source]}
                    </Badge>
                    <p className="truncate flex-1 text-sm font-medium">{item.title}</p>
                  </div>
                  {item.subtitle && (
                    <p className="truncate text-xs text-muted-foreground mt-0.5">
                      {item.subtitle}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
