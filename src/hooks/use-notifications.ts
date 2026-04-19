import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { Database } from "@/integrations/supabase/types";

export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export function useNotifications() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
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
  }, [userId]);

  // Garde une ref stable vers la dernière version de fetch pour le callback realtime
  const fetchRef = useRef(fetchNotifications);
  useEffect(() => {
    fetchRef.current = fetchNotifications;
  }, [fetchNotifications]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime — un seul channel par utilisateur, recréé seulement si l'user change.
  // On ajoute un suffixe aléatoire pour éviter les collisions entre instances du hook.
  useEffect(() => {
    if (!userId) return;
    const channelName = `notifications:${userId}:${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchRef.current();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

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
    if (!userId) return;
    const { error } = await supabase
      .from("notifications")
      .update({ lu: true, lu_le: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("lu", false);
    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, lu: true })));
    }
  }, [userId]);

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
