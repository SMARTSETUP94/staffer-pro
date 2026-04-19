import { Link, useRouterState } from "@tanstack/react-router";
import {
  Calendar, Building2, Users, FileUp, FileDown, ClipboardCheck, Settings, LogOut, Clock, CalendarOff,
  Smartphone, UserCircle, LayoutDashboard, FileText,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "./BrandLogo";
import { ViewAsSwitcher } from "./ViewAsSwitcher";

interface NavItem {
  title: string;
  url: string;
  icon: typeof Calendar;
  /** Visibilité selon le rôle effectif */
  show: (role: "admin" | "chef_chantier" | "employe") => boolean;
}

const items: NavItem[] = [
  { title: "Mes heures", url: "/mobile/heures", icon: Clock, show: (r) => r === "employe" },
  { title: "Tableau de bord", url: "/dashboard", icon: LayoutDashboard, show: (r) => r === "admin" || r === "chef_chantier" },
  { title: "Planning", url: "/planning", icon: Calendar, show: (r) => r === "admin" || r === "chef_chantier" },
  { title: "Affaires", url: "/affaires", icon: Building2, show: (r) => r === "admin" || r === "chef_chantier" },
  { title: "Devis", url: "/devis", icon: FileText, show: (r) => r === "admin" || r === "chef_chantier" },
  { title: "Employés", url: "/employes", icon: Users, show: (r) => r === "admin" || r === "chef_chantier" },
  { title: "Absences", url: "/absences", icon: CalendarOff, show: (r) => r === "admin" || r === "chef_chantier" },
  { title: "Import employés", url: "/employes/import", icon: FileUp, show: (r) => r === "admin" || r === "chef_chantier" },
  { title: "Import devis", url: "/devis/import", icon: FileUp, show: (r) => r === "admin" || r === "chef_chantier" },
  { title: "Export planning", url: "/export", icon: FileDown, show: (r) => r === "admin" || r === "chef_chantier" },
  { title: "Validation heures", url: "/validation-heures", icon: ClipboardCheck, show: (r) => r === "admin" || r === "chef_chantier" },
  { title: "Paramètres", url: "/parametres", icon: Settings, show: (r) => r === "admin" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, roles, signOut, isAdmin } = useAuth();
  const { effectiveRole, isPreviewing, previewRole } = usePreview();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const visibleItems = items.filter((it) => it.show(effectiveRole));

  // En preview "employé" (desktop ou mobile), un admin doit pouvoir naviguer
  // vers les pages mobiles pour QA.
  const showMobilePreview =
    isAdmin && (previewRole === "employe_desktop" || previewRole === "employe_mobile");
  const mobileItems = [
    { title: "Aujourd'hui", url: "/mobile/aujourdhui", icon: Smartphone },
    { title: "Mes heures", url: "/mobile/heures", icon: Clock },
    { title: "Mon profil", url: "/mobile/profil", icon: UserCircle },
  ];

  const isActive = (url: string) =>
    currentPath === url || currentPath.startsWith(url + "/");

  // Rôle réel canonique (admin > chef > employe), pas roles[0] qui dépend de l'ordre DB
  const realRole = roles.includes("admin")
    ? "admin"
    : roles.includes("chef_chantier")
      ? "chef_chantier"
      : (roles[0] ?? "—");
  const displayedRole = isPreviewing ? `${effectiveRole} (preview)` : realRole;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center px-2 py-4">
          {collapsed ? (
            <span className="brand-dot mx-auto" aria-label="Staffing by Setup Paris" />
          ) : (
            <span className="inline-flex items-start gap-2 text-sm font-extrabold uppercase tracking-[0.14em] leading-tight">
              <span className="brand-dot mt-1.5 shrink-0" aria-hidden />
              <span className="flex flex-col">
                <span className="text-[var(--cream)]">Staffing</span>
                <span>
                  <span className="text-[var(--cream)]/60 font-semibold">by</span>{" "}
                  <span className="text-primary">SETUP.PARIS</span>
                </span>
              </span>
            </span>
          )}
        </div>
        <ViewAsSwitcher collapsed={collapsed} />
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

        {showMobilePreview && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="overline !text-sidebar-foreground/60">
                — Vue mobile (preview)
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {mobileItems.map((item) => {
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
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && user && (
          <div className="rounded-xl bg-sidebar-accent/40 px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-sidebar-foreground">
              {user.email}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              {displayedRole}
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
