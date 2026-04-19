import { Link, useRouterState } from "@tanstack/react-router";
import {
  Calendar, Building2, Users, FileUp, FileDown, ClipboardCheck, Settings, LogOut,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "./BrandLogo";

interface NavItem {
  title: string;
  url: string;
  icon: typeof Calendar;
  adminOnly?: boolean;
  chefOrAdmin?: boolean;
}

const items: NavItem[] = [
  { title: "Planning", url: "/planning", icon: Calendar, chefOrAdmin: true },
  { title: "Affaires", url: "/affaires", icon: Building2, chefOrAdmin: true },
  { title: "Employés", url: "/employes", icon: Users, chefOrAdmin: true },
  { title: "Import devis", url: "/devis/import", icon: FileUp, chefOrAdmin: true },
  { title: "Export planning", url: "/export", icon: FileDown, chefOrAdmin: true },
  { title: "Validation heures", url: "/validation-heures", icon: ClipboardCheck, chefOrAdmin: true },
  { title: "Paramètres", url: "/parametres", icon: Settings, adminOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, roles, isAdmin, isAdminOrChef, signOut } = useAuth();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const visibleItems = items.filter((it) => {
    if (it.adminOnly) return isAdmin;
    if (it.chefOrAdmin) return isAdminOrChef;
    return true;
  });

  const isActive = (url: string) =>
    currentPath === url || currentPath.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center px-2 py-4">
          {collapsed ? (
            <span className="brand-dot mx-auto" aria-label="Setup Paris" />
          ) : (
            <BrandLogo tone="cream" word1="SETUP" word2="PARIS" />
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="overline !text-sidebar-foreground/60">
              — Navigation
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className="rounded-xl data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && user && (
          <div className="rounded-xl bg-sidebar-accent/40 px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-sidebar-foreground">
              {user.email}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              {roles[0] ?? "—"}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 rounded-xl text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Se déconnecter</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
