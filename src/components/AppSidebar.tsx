import { Link, useRouterState } from "@tanstack/react-router";

import { LogOut, Wallet } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { useCapabilitiesSet } from "@/hooks/use-capability";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { visibleSidebarSections } from "@/lib/sidebar-navigation";




/**
 * v0.48 Lot L4b — Sidebar unique capability-driven, responsive.
 *
 *  • UN SEUL composant pour tous les viewports et tous les rôles.
 *  • Aucun check `isAdmin/isChef` hardcodé : visibilité via `useCapabilitiesSet`.
 *  • Item "Aujourd'hui" toujours visible (page d'accueil universelle).
 *  • Section visible si AU MOINS UN item visible (cap satisfaite).
 *  • Sur viewport étroit, le composant shadcn `Sidebar` bascule auto
 *    en drawer Sheet (collapsible="icon" + SidebarTrigger dans AppLayout).
 */

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  const closeMobile = () => { if (isMobile) setOpenMobile(false); };
  const { user, roles, signOut } = useAuth();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { data: caps, isLoading: capsLoading } = useCapabilitiesSet();
  const devisStaffing = useFeatureFlag("devis_staffing_v1");
  const sections = visibleSidebarSections(capsLoading ? new Set<string>() : caps, devisStaffing);

  // Un item n'est actif que s'il est la correspondance la plus précise
  // (ex. /logistique/dispos ne surligne pas aussi /logistique).
  const allUrls = sections.flatMap((s) => s.items.map((it) => it.url));
  const matches = (url: string) => currentPath === url || currentPath.startsWith(url + "/")
    || (url === "/affaires" && currentPath === "/liste-chantiers")
    || (url === "/demandes-logistique" && currentPath === "/jalonnements");
  const isActive = (url: string) =>
    matches(url) && !allUrls.some((u) => u.length > url.length && u.startsWith(url + "/") && matches(u));

  // Rôles affichés (multi-rôles séparés par virgule)
  const displayedRoles = roles.length > 0 ? roles.join(" + ") : "—";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/" className="flex items-center px-2 py-4">
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
        </Link>
        
      </SidebarHeader>

      <SidebarContent className="px-1">
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            {!collapsed && (
              <SidebarGroupLabel className="overline !text-sidebar-foreground/60">
                — {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isActive(item.url);
                  const showSubtitle = item.subtitle && !collapsed;
                  return (
                    <SidebarMenuItem key={item.url}>
                      {showSubtitle && <div className="px-2 pb-1 pt-3 text-xs font-medium text-sidebar-foreground/60">{item.subtitle}</div>}
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="rounded-xl data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                      >
                        <Link to={item.url} onClick={closeMobile}>
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate text-sm font-medium">{item.title}</span>

                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <Button asChild variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" title="Mes notes de frais">
          <Link to="/mes-notes-de-frais" onClick={closeMobile} aria-current={currentPath === "/mes-notes-de-frais" ? "page" : undefined}>
            <Wallet className="h-4 w-4" />{!collapsed && <span>Mes notes de frais</span>}
          </Link>
        </Button>
        {!collapsed && user && (
          <div className="rounded-xl bg-sidebar-accent/40 px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-sidebar-foreground">
              {user.email}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              {displayedRoles}
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
