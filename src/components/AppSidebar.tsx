import { Link, useRouterState } from "@tanstack/react-router";
import {
  Calendar, Building2, Users, FileUp, FileDown, ClipboardCheck, Settings, LogOut, HardHat,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

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
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary">
            <HardHat className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">
                Planning chantiers
              </span>
              <span className="truncate text-xs text-sidebar-foreground/60">Scénographie</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && user && (
          <div className="px-2 py-2">
            <p className="truncate text-xs font-medium text-sidebar-foreground">{user.email}</p>
            <p className="text-[10px] uppercase tracking-wide text-sidebar-foreground/60">
              {roles[0] ?? "—"}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Se déconnecter</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
