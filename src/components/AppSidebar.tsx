import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Clock, Calendar, Building2, Users, FileDown, ClipboardCheck, LogOut, CalendarOff,
  UserCircle, FileText, Trophy, Map, ClipboardList,
  Truck, Palette, Warehouse, Hammer, Wrench, BadgeCheck, Lightbulb,
  FileSignature, Inbox, PackageCheck, UsersRound, Briefcase, Settings,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { useValidationCount } from "@/hooks/use-validation-count";
import { useContratsRhCount } from "@/hooks/use-contrats-rh-count";
import { useCapabilitiesSet } from "@/hooks/use-capability";
import { useVocab } from "@/hooks/use-vocab";



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

type CapKey = string;
type Cap = CapKey | CapKey[] | undefined;

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Cap requise. Si omise, item toujours visible. Si tableau, OR logique. */
  cap?: Cap;
  /** Badge compteur (indigo si > 0). */
  count?: number;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

function hasAnyCap(caps: Set<string>, cap: Cap): boolean {
  if (!cap) return true;
  const list = Array.isArray(cap) ? cap : [cap];
  return list.some((c) => caps.has(c));
}

function buildSections(
  validationCount: number,
  contratsRhCount: number,
  vocab: ReturnType<typeof useVocab>,
): NavSection[] {
  return [
    {
      label: "Mon poste",
      items: [
        // Toujours visible — pas de cap.
        { title: "Aujourd'hui", url: "/", icon: Clock },
        
        { title: "Montage & Démontage", url: "/mes-missions", icon: PackageCheck, cap: "mes_missions.view" },
        { title: "Équipe chantier", url: "/mes-chantiers", icon: UsersRound, cap: "mes_chantiers.view" },
        { title: "Mes heures", url: "/mes-heures", icon: Clock, cap: "mes_heures.view" },
        { title: "Mes contrats", url: "/mes-contrats", icon: FileSignature, cap: "mes_contrats.view" },
        { title: "Saisir heures équipe", url: "/saisie-pour-equipe", icon: ClipboardCheck, cap: "heures.equipe.saisir" },

      ],
    },
    {
      label: "Pilotage",
      items: [
        // L6-A : Inbox fusionnée dans `/` (item « Aujourd'hui »).
        { title: "Planning fab", url: "/planning", icon: Calendar, cap: "section.planning_fab" },
        { title: "Pipeline opportunités", url: "/opportunites", icon: Trophy, cap: "section.pipeline_opportunites" },
      ],
    },
    {
      label: "Production",
      items: [
        { title: "Chantiers", url: "/affaires", icon: Building2, cap: "section.affaires" },
        { title: "Devis", url: "/devis", icon: FileText, cap: "section.devis" },
        { title: "Fabrication atelier", url: "/fabrication", icon: Hammer, cap: "section.planning_fab" },
      ],
    },
    {
      label: "Logistique",
      items: [
        { title: "Véhicules", url: "/flotte", icon: Truck, cap: "section.logistique" },
        { title: "Planning véhicules", url: "/logistique/vehicules-planning", icon: Calendar, cap: "section.logistique" },
        { title: "Demandes transport", url: "/export/demandes-devis", icon: ClipboardList, cap: "section.admin" },
      ],
    },
    {
      label: "Équipes",
      items: [
        { title: "Employés", url: "/employes", icon: Users, cap: "section.equipes" },
        { title: "Intermittents", url: "/interimaires", icon: Briefcase, cap: "section.equipes" },
        { title: "Absences", url: "/absences", icon: CalendarOff, cap: "section.equipes" },
        {
          title: vocab.validerHeures,
          url: "/validation-heures",
          icon: ClipboardCheck,
          cap: "action.validate_hours",
          count: validationCount,
        },
      ],
    },
    {
      label: "Module RH",
      items: [
        { title: "Management RH", url: "/rh", icon: FileSignature, cap: "section.contrats_rh" },
        { title: "Contrats CDDU", url: "/rh/contrats", icon: FileSignature, cap: "section.contrats_rh", count: contratsRhCount },
      ],
    },
    {
      label: "Admin",
      items: [
        { title: "Utilisateurs", url: "/admin/utilisateurs", icon: UserCircle, cap: "section.admin" },
        { title: "Permissions", url: "/admin/permissions", icon: BadgeCheck, cap: "admin.permissions.manage" },
        { title: "Feature flags", url: "/admin/feature-flags", icon: Lightbulb, cap: "admin.feature_flags.manage" },
        { title: "Métiers & postes", url: "/parametres/metiers", icon: Palette, cap: "section.admin" },
        { title: "Lieux entreprise", url: "/parametres/lieux", icon: Warehouse, cap: "section.admin" },
        { title: "Audit Admin", url: "/admin/audit", icon: ClipboardCheck, cap: "section.admin" },
        { title: "Exports", url: "/export", icon: FileDown, cap: "section.admin" },
        { title: "Roadmap", url: "/roadmap", icon: Map, cap: "section.admin" },
        { title: "Réglages compétences", url: "/parametres/competences-equipe", icon: Settings, cap: "section.admin" },
        { title: "Rôles fabrication", url: "/parametres/roles-fabrication", icon: Wrench, cap: "section.admin" },
      ],
    },
  ];
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, roles, signOut } = useAuth();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const validationCount = useValidationCount();
  const contratsRhCount = useContratsRhCount();
  const { data: caps, isLoading: capsLoading } = useCapabilitiesSet();
  const vocab = useVocab();

  // Filtrage : un item est visible si pas de cap OU cap satisfaite.
  // "Aujourd'hui" reste TOUJOURS visible (pas de cap déclarée).
  const rawSections = buildSections(validationCount, contratsRhCount, vocab);
  const sections = capsLoading
    ? // Pendant le load : on n'affiche que les items toujours visibles
      // (évite le flash "toutes les sections puis disparition").
      rawSections
        .map((s) => ({ ...s, items: s.items.filter((it) => !it.cap) }))
        .filter((s) => s.items.length > 0)
    : rawSections
        .map((s) => ({ ...s, items: s.items.filter((it) => hasAnyCap(caps, it.cap)) }))
        .filter((s) => s.items.length > 0);

  const isActive = (url: string) =>
    currentPath === url || currentPath.startsWith(url + "/");

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
                            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
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
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
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
