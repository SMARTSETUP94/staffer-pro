import { useNavigate } from "@tanstack/react-router";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, type Notification } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

const typeIcon: Record<Notification["type"], string> = {
  assignation_creee: "📅",
  assignation_modifiee: "✏️",
  assignation_supprimee: "🗑️",
  heures_soumises: "⏱️",
  heures_validees: "✅",
  heures_rejetees: "❌",
  absence_demandee: "🏖️",
  absence_validee: "✔️",
  conflit_staffing: "⚠️",
  depassement_budget: "💰",
  mention: "💬",
};

function formatRelative(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `Il y a ${j} j`;
  return d.toLocaleDateString("fr-FR");
}

export function NotificationBell() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();
  const navigate = useNavigate();

  const handleClick = async (n: Notification) => {
    if (!n.lu) await markAsRead(n.id);
    if (n.lien) {
      navigate({ to: n.lien });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full px-1 text-[10px] leading-none flex items-center justify-center"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h3 className="text-sm font-semibold">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({unreadCount} non lue{unreadCount > 1 ? "s" : ""})
              </span>
            )}
          </h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => markAllAsRead()}
            >
              <CheckCheck className="h-3 w-3" />
              Tout marquer lu
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucune notification
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "group flex gap-3 px-4 py-3 transition-colors hover:bg-muted/40 cursor-pointer",
                    !n.lu && "bg-primary/5",
                  )}
                  onClick={() => handleClick(n)}
                >
                  <span className="text-lg leading-tight" aria-hidden>
                    {typeIcon[n.type] ?? "🔔"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={cn(
                          "text-sm leading-tight truncate",
                          !n.lu ? "font-semibold" : "font-medium",
                        )}
                      >
                        {n.titre}
                      </p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatRelative(n.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {n.message}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.lu && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(n.id);
                        }}
                        aria-label="Marquer lu"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(n.id);
                      }}
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
