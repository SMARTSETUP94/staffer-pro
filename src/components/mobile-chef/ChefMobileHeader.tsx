import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/hooks/use-notifications";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function ChefMobileHeader({ title }: { title: string }) {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
      <h1 className="text-base font-semibold truncate">{title}</h1>
      <div className="flex items-center gap-2">
        <Link
          to="/mobile/profil"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 inline-flex min-w-[16px] h-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
        <Link to="/mobile/profil" aria-label="Profil">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-sm">{initial}</AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
