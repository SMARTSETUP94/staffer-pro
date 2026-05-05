// Sprint 2b2.2 — carte suggestion 1 personne (tier-based) avec slider d'affectation %.
import { useState } from "react";
import { AlertTriangle, Loader2, Sliders } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { TIER_COLORS, type Suggestion } from "./shared";

export function PersonneSuggestionCard({
  suggestion,
  alreadyAssigned,
  cumul,
  onAssign,
}: {
  suggestion: Suggestion;
  alreadyAssigned: boolean;
  cumul: number;
  onAssign: (presencePct: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [showSlider, setShowSlider] = useState(false);
  const [pct, setPct] = useState(100);
  const tier = TIER_COLORS[suggestion.tier];
  const initials = `${suggestion.employe.prenom[0] ?? "?"}${suggestion.employe.nom[0] ?? "?"}`.toUpperCase();
  const conflictAfter = cumul + 100 > 100 && !alreadyAssigned;

  const doAssign = async (p: number) => {
    setBusy(true);
    try {
      await onAssign(p);
      setShowSlider(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card p-2">
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="truncate text-xs font-semibold">
            {suggestion.employe.prenom} {suggestion.employe.nom}
          </p>
          <Badge className={`px-1 py-0 text-[9px] font-bold ${tier.bg} ${tier.text}`} variant="outline">
            {tier.label}
          </Badge>
          {suggestion.absent_today && (
            <Badge
              variant="outline"
              className="px-1 py-0 text-[9px] font-bold bg-destructive/15 text-destructive border-destructive/30"
              title="Absent ce jour"
            >
              Absent ce jour
            </Badge>
          )}
          {!suggestion.absent_today && suggestion.absent_days_in_step > 0 && (
            <Badge
              variant="outline"
              className="px-1 py-0 text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
              title={`Absent ${suggestion.absent_days_in_step} j sur la fenêtre du step`}
            >
              Absent {suggestion.absent_days_in_step} j
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-mono">{suggestion.employe.type_contrat}</span>
          <span>·</span>
          <span className="font-mono">Score {suggestion.score}</span>
          <span>·</span>
          <span className="font-mono">{suggestion.dispo_pct}% libre</span>
        </div>
        {conflictAfter && (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-destructive">
            <AlertTriangle className="h-2.5 w-2.5" />
            Cumul jour : {cumul}%
          </div>
        )}
      </div>
      {showSlider ? (
        <div className="flex items-center gap-2">
          <Slider
            key={`assign-pct-${suggestion.employe.id}`}
            min={10}
            max={100}
            step={10}
            value={[pct]}
            onValueChange={(v) => setPct(v[0] ?? 100)}
            className="w-20"
          />
          <span className="w-9 font-mono text-[10px] font-bold tabular-nums">{pct}%</span>
          <Button size="sm" disabled={busy} onClick={() => doAssign(pct)}>
            OK
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={busy || alreadyAssigned}
            onClick={() => setShowSlider(true)}
            title="Affecter avec %"
            data-write="1"
            className="h-7 w-7"
          >
            <Sliders className="h-3 w-3" />
          </Button>
          <Button size="sm" disabled={busy || alreadyAssigned} onClick={() => doAssign(100)} data-write="1">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : alreadyAssigned ? "Affecté" : "Affecter"}
          </Button>
        </div>
      )}
    </div>
  );
}
