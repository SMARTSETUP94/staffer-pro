/**
 * v0.26.0 — Widget "Objets en retard" (étapes en_cours sans avancement +14j).
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Item {
  etape_id: string;
  objet_id: string;
  objet_ref: string;
  objet_nom: string;
  affaire_id: string;
  affaire_label: string;
  date_debut: string;
  joursRetard: number;
}

export function ObjetsEnRetardWidget() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cutoffStr = cutoff.toISOString();
      const { data: etapes } = await supabase
        .from("fabrication_etapes")
        .select("id, objet_id, date_debut")
        .eq("statut", "en_cours")
        .lte("date_debut", cutoffStr)
        .limit(50);
      if (cancelled || !etapes || etapes.length === 0) {
        setItems([]); setLoading(false); return;
      }
      const objIds = etapes.map((e) => e.objet_id as string);
      const { data: objs } = await supabase
        .from("fabrication_objets")
        .select("id, reference, nom, affaire_id, archive")
        .in("id", objIds);
      const visible = (objs ?? []).filter((o) => !o.archive);
      const affIds = Array.from(new Set(visible.map((o) => o.affaire_id as string)));
      const { data: affs } = affIds.length
        ? await supabase.from("affaires").select("id, numero, nom").in("id", affIds)
        : { data: [] as { id: string; numero: string; nom: string }[] };
      if (cancelled) return;
      const objMap = new Map(visible.map((o) => [o.id as string, o]));
      const affMap = new Map((affs ?? []).map((a) => [a.id, a]));
      const today = Date.now();
      const result = etapes
        .filter((e) => objMap.has(e.objet_id as string))
        .map((e) => {
          const o = objMap.get(e.objet_id as string)!;
          const a = affMap.get(o.affaire_id as string);
          const start = e.date_debut ? new Date(e.date_debut).getTime() : today;
          return {
            etape_id: e.id as string,
            objet_id: o.id as string,
            objet_ref: o.reference as string,
            objet_nom: o.nom as string,
            affaire_id: o.affaire_id as string,
            affaire_label: a ? `${a.numero} — ${a.nom}` : "?",
            date_debut: e.date_debut as string,
            joursRetard: Math.floor((today - start) / 86_400_000),
          };
        })
        .sort((a, b) => b.joursRetard - a.joursRetard)
        .slice(0, 8);
      setItems(result);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          Objets en retard (+14j)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Aucun objet en retard 🎉</p>
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <li key={it.etape_id} className="flex items-center justify-between gap-2 py-2">
                <Link to="/affaires/$affaireId/fabrication" params={{ affaireId: it.affaire_id }} className="min-w-0 flex-1 hover:text-primary">
                  <p className="truncate text-xs font-medium">
                    <span className="font-mono text-[10px] text-muted-foreground">{it.objet_ref}</span> — {it.objet_nom}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">{it.affaire_label}</p>
                </Link>
                <Badge variant="destructive" className="shrink-0 text-[10px] tabular-nums">{it.joursRetard}j</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
