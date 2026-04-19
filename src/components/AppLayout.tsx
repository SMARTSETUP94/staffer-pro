import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { PreviewBanner } from "./PreviewBanner";
import { NotificationBell } from "./NotificationBell";
import { CommandPalette } from "./CommandPalette";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <CommandPalette />
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <PreviewBanner />
          <header className="flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger className="text-foreground" />
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex h-8 gap-2 text-xs text-muted-foreground"
                onClick={() => {
                  const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true });
                  window.dispatchEvent(event);
                }}
              >
                <Search className="h-3 w-3" />
                Rechercher
                <kbd className="ml-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
              </Button>
              <NotificationBell />
              <span className="overline hidden sm:inline-block">— Studio</span>
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-background">{children}</main>
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}
