/**
 * v0.40.x — Widget "Anniversaires du jour".
 * Affiche prénoms + avatars des employés actifs fêtant leur anniversaire aujourd'hui.
 * RGPD : pas d'année de naissance affichée.
 * Si 0 anniversaire → null (cellule vide).
 */
import { useEffect, useState } from "react";
import { Cake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isBirthdayToday } from "@/lib/dashboard-fun-helpers";

interface Birthday {
  id: string;
  prenom: string;
  avatar_url: string | null;
}

export function AnniversairesWidget() {
  const [list, setList] = useState<Birthday[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date();
      const { data } = await supabase
        .from("employes")
        .select("id, prenom, date_naissance, profiles:profile_id(avatar_url, date_naissance)")
        .eq("actif", true);
      if (cancelled) return;
      const matches: Birthday[] = (data ?? [])
        .filter((e: any) => isBirthdayToday(e.date_naissance ?? e.profiles?.date_naissance, today))
        .map((e: any) => ({
          id: e.id,
          prenom: e.prenom,
          avatar_url: e.profiles?.avatar_url ?? null,
        }));
      setList(matches);
    })();
    return () => { cancelled = true; };
  }, []);

  if (list === null || list.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cake className="h-4 w-4 text-pink-500" />
          Anniversaires du jour
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="absolute text-base animate-confetti"
              style={{
                left: `${(i * 7.3) % 100}%`,
                top: `-10%`,
                animationDelay: `${(i % 5) * 0.15}s`,
              }}
            >
              {["🎉", "🎊", "🎂", "✨", "🎈"][i % 5]}
            </span>
          ))}
        </div>
        <div className="relative flex flex-wrap items-center gap-3">
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-full bg-pink-500/10 px-3 py-1">
              <Avatar className="h-6 w-6">
                {p.avatar_url ? <AvatarImage src={p.avatar_url} alt={p.prenom} /> : null}
                <AvatarFallback className="text-[10px]">{p.prenom.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{p.prenom}</span>
            </div>
          ))}
          <p className="ml-1 text-xs text-muted-foreground">Bon anniversaire 🎂</p>
        </div>
      </CardContent>
    </Card>
  );
}
