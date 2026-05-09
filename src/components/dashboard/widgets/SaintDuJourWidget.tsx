/**
 * v0.40.x — Widget "Saint du jour".
 * Match prénom employé ↔ saint du jour (liste hardcodée FR).
 * Si pas de match → null.
 */
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSaintsForDate, normalizePrenom } from "@/lib/saints-fr";

export function SaintDuJourWidget() {
  const [matches, setMatches] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saints = getSaintsForDate(new Date());
      if (saints.length === 0) {
        if (!cancelled) setMatches([]);
        return;
      }
      const { data } = await supabase
        .from("employes")
        .select("prenom")
        .eq("actif", true);
      if (cancelled) return;
      const set = new Set<string>();
      for (const e of data ?? []) {
        const norm = normalizePrenom(e.prenom);
        for (const s of saints) {
          if (norm === s || norm.startsWith(s)) set.add(e.prenom);
        }
      }
      setMatches(Array.from(set));
    })();
    return () => { cancelled = true; };
  }, []);

  if (matches === null || matches.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Bonne fête !
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          Aujourd'hui on souhaite une bonne fête à{" "}
          {matches.map((p, i) => (
            <span key={p}>
              <Badge variant="secondary" className="font-medium">{p}</Badge>
              {i < matches.length - 1 ? " " : ""}
            </span>
          ))}
          {" "}🥳
        </p>
      </CardContent>
    </Card>
  );
}
