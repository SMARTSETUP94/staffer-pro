import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ChefMobileBottomNav } from "@/components/mobile-chef/ChefMobileBottomNav";

export const Route = createFileRoute("/mobile/chef")({
  head: () => ({ meta: [{ title: "Hub chef — Setup Paris" }] }),
  component: ChefMobileLayout,
});

function ChefMobileLayout() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <Outlet />
      <ChefMobileBottomNav />
    </div>
  );
}
