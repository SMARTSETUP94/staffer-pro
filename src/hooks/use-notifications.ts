import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { Database } from "@/integrations/supabase/types";

export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) setNotifications(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ lu: true, lu_le: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, lu: true } : n)),
      );
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const { error } = await supabase
      .from("notifications")
      .update({ lu: true, lu_le: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("lu", false);
    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, lu: true })));
    }
  }, [user]);

  const deleteNotification = useCallback(async (id: string) => {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (!error) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.lu).length;

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh: fetchNotifications,
  };
}
