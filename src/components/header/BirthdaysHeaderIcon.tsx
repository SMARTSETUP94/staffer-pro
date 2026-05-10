/**
 * v0.40.x — Icône header "Anniversaires" (compaction widgets dashboard).
 * Affiche : anniversaires aujourd'hui + à venir dans les 7 prochains jours.
 * Auto-hide si aucun anniversaire dans la fenêtre 7j.
 */
import { useEffect, useState } from "react";
import { Cake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Entry {
  id: string;
  prenom: string;
  nom: string;
  avatar_url: string | null;
  daysAhead: number; // 0 = today, 1..7 = upcoming
  monthDay: string; // MM-DD for display
}

function parseBirthday(s: string | null | undefined): { m: number; d: number } | null {
  if (!s) return null;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return { m: dt.getMonth(), d: dt.getDate() };
}

/** Days from `today` until next occurrence of (month, day), inclusive (0 = today). 0..7 or null. */
function daysUntilBirthday(birth: { m: number; d: number }, today: Date, windowDays = 7): number | null {
  for (let i = 0; i <= windowDays; i++) {
    const probe = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (probe.getMonth() === birth.m && probe.getDate() === birth.d) return i;
  }
  return null;
}

export function BirthdaysHeaderIcon() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date();
      const { data } = await supabase
        .from("employes")
        .select("id, prenom, nom, date_naissance, profiles:profile_id(avatar_url, date_naissance)")
        .eq("actif", true);
      if (cancelled) return;
      const list: Entry[] = [];
      for (const e of (data ?? []) as any[]) {
        const dob = parseBirthday(e.date_naissance ?? e.profiles?.date_naissance);
        if (!dob) continue;
        const days = daysUntilBirthday(dob, today, 7);
        if (days === null) continue;
        list.push({
          id: e.id,
          prenom: e.prenom,
          nom: e.nom ?? "",
          avatar_url: e.profiles?.avatar_url ?? null,
          daysAhead: days,
          monthDay: `${String(dob.m + 1).padStart(2, "0")}-${String(dob.d).padStart(2, "0")}`,
        });
      }
      list.sort((a, b) => a.daysAhead - b.daysAhead || a.prenom.localeCompare(b.prenom));
      setEntries(list);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!entries || entries.length === 0) return null;

  const todays = entries.filter((e) => e.daysAhead === 0);
  const upcoming = entries.filter((e) => e.daysAhead > 0);
  const todayCount = todays.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10"
          aria-label={`Anniversaires : ${todayCount} aujourd'hui, ${upcoming.length} cette semaine`}
        >
          <Cake className="h-6 w-6 text-pink-500" strokeWidth={2} />
          {todayCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {todayCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {todays.length > 0 && (
          <div className="relative overflow-hidden border-b bg-pink-500/10 px-4 py-3">
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              {Array.from({ length: 10 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute text-sm animate-confetti"
                  style={{
                    left: `${(i * 11) % 100}%`,
                    top: `-10%`,
                    animationDelay: `${(i % 5) * 0.2}s`,
                  }}
                >
                  {["🎉", "🎊", "🎂", "✨", "🎈"][i % 5]}
                </span>
              ))}
            </div>
            <p className="relative mb-2 text-xs font-semibold uppercase tracking-wide text-pink-700">
              🎂 Aujourd'hui
            </p>
            <div className="relative flex flex-wrap gap-2">
              {todays.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-full bg-background/80 px-2.5 py-1 shadow-sm">
                  <Avatar className="h-5 w-5">
                    {p.avatar_url ? <AvatarImage src={p.avatar_url} alt={p.prenom} /> : null}
                    <AvatarFallback className="text-[9px]">{p.prenom.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium">{p.prenom}{p.nom ? ` ${p.nom}` : ""}</span>
                </div>
              ))}
            </div>
            <p className="relative mt-1 text-[11px] text-pink-700">Bon anniversaire 🎉</p>
          </div>
        )}
        <div className="px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cette semaine
          </p>
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun autre anniversaire dans les 7 prochains jours.</p>
          ) : (
            <ul className="space-y-1.5">
              {upcoming.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      {p.avatar_url ? <AvatarImage src={p.avatar_url} alt={p.prenom} /> : null}
                      <AvatarFallback className="text-[9px]">{p.prenom.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span>{p.prenom}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    J+{p.daysAhead} · {p.monthDay.replace("-", "/")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
