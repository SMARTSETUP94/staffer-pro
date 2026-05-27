import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/hooks/use-notifications";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ChefMobileHeader({ title }: { title: string }) {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-3"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <h1 className="text-base font-semibold truncate flex-1 min-w-0">{title}</h1>
          </TooltipTrigger>
          <TooltipContent side="bottom">{title}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          to="/aujourdhui"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent active:bg-accent/70"
          aria-label={
            unreadCount > 0
              ? `Notifications — ${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
              : "Notifications"
          }
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 inline-flex min-w-[16px] h-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
        <Link
          to="/aujourdhui"
          aria-label="Mon profil"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent active:bg-accent/70"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-sm">{initial}</AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
