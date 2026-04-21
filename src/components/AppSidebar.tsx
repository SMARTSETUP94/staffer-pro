import { Link, useRouterState } from "@tanstack/react-router";
import {
  Calendar, Building2, Users, FileUp, FileDown, ClipboardCheck, LogOut, Clock, CalendarOff,
  Smartphone, UserCircle, LayoutDashboard, FileText, Trophy, Map, ArrowLeftRight, ClipboardList,
  Truck, FileQuestion, Palette, MessageCircle,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { Button } from "@/components/ui/button";
import { useValidationCount } from "@/hooks/use-validation-count";

import { ViewAsSwitcher } from "./ViewAsSwitcher";

type EffRole = "admin" | "chef_chantier" | "employe";

/**
 * v0.13 — Refonte IA : 5 sections
 *  • PILOTAGE      : Dashboard, Planning
 *  • CHANTIERS     : Chantiers (ex Affaires), Devis, Demandes de devis
 *  • ÉQUIPES       : Employés, Intérimaires, Absences, Validation heures (badge count)
 *  • VÉHICULES     : Véhicules (ex Flotte)
 *  • ADMINISTRATION (admin only) : Utilisateurs, Imports, Exports, Paramètres, Roadmap
 *
 * RBAC strict : on filtre sur `effectiveRole` (et non `isAdmin` réel) pour que
 * la preview "Chef" cache bien la section ADMINISTRATION à un admin.
 */

interface NavItem {
  title: string;
  url: string;
  icon: typeof Calendar;
  /** Visibilité selon le rôle effectif. */
  show: (role: EffRole) => boolean;
  /** Compteur optionnel (badge indigo si > 0). */
  count?: number;
}

interface NavSection {
  /** Libellé affiché en overline. */
  label: string;
  items: NavItem[];
}

function buildSections(role: EffRole, validationCount: number): NavSection[] {
  const isAdmin = role === "admin";
  const isAdminOrChef = role === "admin" || role === "chef_chantier";

  // ===== Vue Employé : 3 items flat =====
  if (role === "employe") {
    return [
      {
        label: "Espace personnel",
        items: [
          { title: "Ma semaine", url: "/dashboard-employe", icon: LayoutDashboard, show: () => true },
          { title: "Mes heures", url: "/mes-heures", icon: Clock, show: () => true },
          { title: "Mes échanges", url: "/mes-swaps", icon: ArrowLeftRight, show: () => true },
          { title: "Mes propositions", url: "/mes-propositions", icon: ClipboardList, show: () => true },
        ],
      },
    ];
  }

  // ===== Vue Chef / Admin =====
  const sections: NavSection[] = [
    {
      label: "Pilotage",
      items: [
        { title: "Tableau de bord", url: "/dashboard", icon: LayoutDashboard, show: () => true },
        { title: "Planning", url: "/planning", icon: Calendar, show: () => true },
      ],
    },
    {
      label: "Chantiers",
      items: [
        // Renommé v0.13 : "Affaires" → "Chantiers" (route /affaires conservée)
        { title: "Chantiers", url: "/affaires", icon: Building2, show: () => true },
        { title: "Devis", url: "/devis", icon: FileText, show: () => true },
        { title: "Demandes de devis", url: "/export/demandes-devis", icon: FileQuestion, show: () => true },
      ],
    },
    {
      label: "Équipes",
      items: [
        { title: "Employés", url: "/employes", icon: Users, show: () => true },
        { title: "Intérimaires", url: "/interimaires", icon: Trophy, show: () => true },
        { title: "Absences", url: "/absences", icon: CalendarOff, show: () => true },
        {
          title: "Validation heures",
          url: "/validation-heures",
          icon: ClipboardCheck,
          show: () => true,
          count: validationCount,
        },
      ],
    },
    {
      // Renommé v0.13 : section "Flotte" → "Véhicules"
      label: "Véhicules",
      items: [
        { title: "Véhicules", url: "/flotte", icon: Truck, show: () => true },
      ],
    },
  ];

  // ===== Administration : admin only (rôle effectif) =====
  if (isAdmin) {
    sections.push({
      label: "Administration",
      items: [
        { title: "Utilisateurs", url: "/parametres/utilisateurs", icon: UserCircle, show: () => true },
        { title: "Imports", url: "/employes/import", icon: FileUp, show: () => true },
        { title: "Export planning", url: "/export", icon: FileDown, show: () => true },
        { title: "Métiers", url: "/parametres/metiers", icon: Palette, show: () => true },
        { title: "Signalements", url: "/admin/feedback", icon: MessageCircle, show: () => true },
        { title: "Roadmap", url: "/roadmap", icon: Map, show: () => true },
      ],
    });
  }
  // Le chef ne voit AUCUNE section Administration. Les exports/demandes
  // de devis qu'il utilise sont déjà accessibles via le menu Chantiers.

  return sections;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, roles, signOut, isAdmin } = useAuth();
  const { effectiveRole, isPreviewing, previewRole } = usePreview();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const validationCount = useValidationCount();

  // RBAC visuel : on s'appuie sur effectiveRole pour respecter le mode preview.
  const sections = buildSections(effectiveRole as EffRole, validationCount);

  // En preview "employé" (desktop ou mobile), un admin doit pouvoir naviguer
  // vers les pages mobiles pour QA. (basé sur le vrai isAdmin, pas effectif)
  const showMobilePreview =
    isAdmin && (previewRole === "employe_desktop" || previewRole === "employe_mobile");
  const mobileItems = [
    { title: "Aujourd'hui", url: "/mobile/aujourdhui", icon: Smartphone },
    { title: "Mes heures (mobile)", url: "/mobile/heures", icon: Clock },
    { title: "Mes échanges (mobile)", url: "/mobile/swaps", icon: ArrowLeftRight },
    { title: "Mes propositions (mobile)", url: "/mobile/propositions", icon: ClipboardList },
    { title: "Mon profil", url: "/mobile/profil", icon: UserCircle },
  ];

  const isActive = (url: string) =>
    currentPath === url || currentPath.startsWith(url + "/");

  // Rôle réel canonique (admin > chef > employe)
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
                  const showBadge = (item.count ?? 0) > 0;
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="rounded-xl data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                      >
                        <Link to={item.url}>
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate text-sm font-medium">{item.title}</span>
                          {showBadge && !collapsed && (
                            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1.5 text-[10px] font-bold text-white">
                              {item.count}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

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
