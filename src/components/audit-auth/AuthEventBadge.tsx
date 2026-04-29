import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { authEventLabel, authEventTone } from "@/lib/audit-auth-helpers";

const TONE_CLASS: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20",
  info: "bg-sky-500/15 text-sky-700 border-sky-500/30 hover:bg-sky-500/20",
  warning: "bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/20",
  danger: "bg-rose-500/15 text-rose-700 border-rose-500/30 hover:bg-rose-500/20",
  neutral: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
};

export function AuthEventBadge({ action }: { action: string | null }) {
  const tone = authEventTone(action);
  return (
    <Badge variant="outline" className={cn("font-medium", TONE_CLASS[tone])}>
      {authEventLabel(action)}
    </Badge>
  );
}
