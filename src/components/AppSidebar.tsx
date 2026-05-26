import { Link, useRouterState } from "@tanstack/react-router";
import {
  Calendar, Building2, Users, FileUp, FileDown, ClipboardCheck, LogOut, Clock, CalendarOff,
  Smartphone, UserCircle, LayoutDashboard, FileText, Trophy, Map, ArrowLeftRight, ClipboardList,
  Truck, FileQuestion, Palette, MessageCircle, Warehouse, Hammer, Wrench, BadgeCheck, Lightbulb, FileSignature, Inbox, PackageCheck, UsersRound,
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
import { useContratsRhCount } from "@/hooks/use-contrats-rh-count";
import { useCapabilitiesSet } from "@/hooks/use-capability";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { useVocab } from "@/hooks/use-vocab";
import type { VocabKey } from "@/lib/labels";

import { ViewAsSwitcher } from "./ViewAsSwitcher";

type EffRole = "admin" | "chef_chantier" | "employe" | "rh";

/**
 * v0.48 Lot 7.2 — Sidebar capability-driven.
 *
 *  • Chaque item peut déclarer une `cap` (string). Si présente, l'item n'est
 *    rendu QUE si l'utilisateur possède cette capability (via `useCapabilities`,
 *    un seul fetch batché).
 *  • `role` sert encore à choisir le **template de sidebar** (employé flat vs
 *    chef/admin sectionné) et à révéler la sous-section "Vue mobile (preview)"
 *    réservée à un admin en mode preview. Pour la visibilité fine des items
 *    on s'appuie désormais sur les caps — plus de tests `r === "admin"` en dur.
 */

interface NavItem {
  title: string;
  url: string;
  icon: typeof Calendar;
  /** Capability requise pour afficher l'item. Si omise, item toujours visible. */
  cap?: string;
  /** Compteur optionnel (badge indigo si > 0). */
  count?: number;
}

interface NavSection {
  /** Libellé affiché en overline. */
  label: string;
  items: NavItem[];
}


function buildSections(role: EffRole, validationCount: number, contratsRhCount: number, vocab: Record<VocabKey, string>): NavSection[] {
  const isAdmin = role === "admin";

  // ===== Vue Employé : items flat (gating au niveau du template) =====
  if (role === "employe") {
    return [
      {
        label: "Espace personnel",
        items: [
          { title: "Ma semaine", url: "/ma-semaine", icon: LayoutDashboard },
          { title: "Mes missions pose", url: "/mobile/mes-missions", icon: PackageCheck },
          { title: "Mes équipes chantiers", url: "/mobile/equipe-chantiers", icon: UsersRound },
          { title: "Mes heures", url: "/mes-heures", icon: Clock, cap: "heures.personnelles.saisir" },
          { title: "Mes étapes fab", url: "/fabrication/mes-etapes", icon: Wrench },
          { title: "Mes échanges", url: "/mes-swaps", icon: ArrowLeftRight },
          { title: "Mes propositions", url: "/mes-propositions", icon: ClipboardList },
          { title: "Mes contrats", url: "/mes-contrats", icon: FileSignature, cap: "contrats.view_own" },
        ],
      },
    ];
  }

  // ===== Vue Chef / Admin — items gatés par capability =====
  const sections: NavSection[] = [
    {
      label: "Pilotage",
      items: [
        { title: "Tableau de bord", url: "/dashboard", icon: LayoutDashboard },
        { title: "Inbox", url: "/inbox", icon: Inbox, cap: "inbox.view" },
        { title: "Planning", url: "/planning", icon: Calendar, cap: "planning.view" },
      ],
    },
    {
      label: "Chantiers",
      items: [
        { title: "Opportunités", url: "/opportunites", icon: Trophy, cap: "affaires.view" },
        { title: "Chantiers", url: "/affaires", icon: Building2, cap: "affaires.view" },
        { title: "Devis", url: "/devis", icon: FileText, cap: "devis.view" },
        
      ],
    },
    {
      label: "Équipes",
      items: [
        { title: "Employés", url: "/employes", icon: Users, cap: "employes.view" },
        { title: "Intermittents", url: "/interimaires", icon: Trophy, cap: "employes.view" },
        { title: "Absences", url: "/absences", icon: CalendarOff, cap: "heures.equipe.saisir" },
        {
          title: vocab.validerHeures,
          url: "/validation-heures",
          icon: ClipboardCheck,
          cap: "heures.valider",
          count: validationCount,
        },
        { title: "Saisie pour l'équipe", url: "/saisie-pour-equipe", icon: ClipboardList, cap: "heures.equipe.saisir" },
        { title: vocab.assignerPonctuel, url: "/staffer-mobile", icon: Smartphone, cap: "staffing.assignations.edit" },
        { title: "Module RH", url: "/rh", icon: FileSignature, cap: "rh.hub.view" },
        { title: "Contrats RH", url: "/rh/contrats", icon: FileSignature, cap: "contrats.view", count: contratsRhCount },
        { title: "Analyse heures", url: "/heures-analyse", icon: Clock, cap: "heures.audit" },
      ],
    },
    {
      label: "Atelier",
      items: [
        { title: "Dashboard fabrication", url: "/fabrication", icon: Hammer, cap: "affaires.view" },
        { title: "Mes étapes", url: "/fabrication/mes-etapes", icon: Wrench },
      ],
    },
    {
      label: "Logistique",
      items: [
        { title: "Véhicules", url: "/flotte", icon: Truck },
        { title: "Véhicules planning", url: "/logistique/vehicules-planning", icon: Calendar },
        { title: "Demandes transport", url: "/export/demandes-devis", icon: FileQuestion },
      ],
    },
    {
      label: "Outils",
      items: [
        { title: "Export planning", url: "/export", icon: FileDown, cap: "planning.view" },
        { title: "Feuille de route", url: "/export/feuille-de-route", icon: ClipboardList, cap: "planning.view" },
        { title: "Imports", url: "/employes/import", icon: FileUp, cap: "employes.import" },
      ],
    },
  ];

  if (isAdmin) {
    sections.push({
      label: "Admin · Comptes & accès",
      items: [
        { title: "Utilisateurs", url: "/parametres/utilisateurs", icon: UserCircle, cap: "parametres.utilisateurs" },
        { title: "Audit Auth", url: "/audit-auth", icon: ClipboardCheck, cap: "admin.audit" },
        { title: "Permissions", url: "/admin/permissions", icon: BadgeCheck, cap: "admin.permissions" },
        { title: "Feature flags", url: "/admin/feature-flags", icon: Lightbulb, cap: "admin.feature_flags" },
      ],
    });
    sections.push({
      label: "Admin · Référentiels",
      items: [
        { title: "Métiers & postes", url: "/parametres/metiers", icon: Palette, cap: "parametres.view" },
        { title: "Rôles fabrication", url: "/parametres/roles-fabrication", icon: Hammer, cap: "parametres.view" },
        { title: "Lieux entreprise", url: "/parametres/lieux", icon: Warehouse, cap: "parametres.view" },
        { title: "Autorisations véhicules", url: "/parametres/autorisations-vehicules", icon: BadgeCheck, cap: "parametres.view" },
        { title: "Sous-traitants", url: "/parametres/sous-traitants", icon: Truck, cap: "parametres.view" },
      ],
    });
    sections.push({
      label: "Admin · Audit & qualité",
      items: [
        { title: "Audit heures", url: "/audit-heures", icon: ClipboardCheck, cap: "heures.audit" },
        { title: "Audit Admin (docs + validations)", url: "/admin/audit", icon: ClipboardCheck, cap: "admin.audit" },
        { title: "Rattachement devis", url: "/devis/rattachement-historique", icon: ClipboardList, cap: "devis.view" },
        { title: "Signalements", url: "/admin/feedback", icon: MessageCircle, cap: "admin.audit" },
      ],
    });
    sections.push({
      label: "Admin · Système",
      items: [
        { title: "Contenu widgets", url: "/admin/contenu-widgets", icon: Lightbulb, cap: "admin.feature_flags" },
        { title: "Roadmap", url: "/roadmap", icon: Map },
      ],
    });
  }

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
  const contratsRhCount = useContratsRhCount();
  const { data: caps, isLoading: capsLoading } = useCapabilitiesSet();
  const vocab = useVocab();
  // Lot 7.0d — Flag-first : gating capability-driven activable sélectivement.
  // Off (défaut) → fallback ancien comportement (tous les items visibles, sécurité
  // garantie par les guards beforeLoad sur chaque route). On → filtrage caps actif.
  const capGatingEnabled = useFeatureFlag("sidebar_capability_v1");

  // RBAC visuel : on s'appuie sur effectiveRole pour respecter le mode preview.
  const rawSections = buildSections(effectiveRole as EffRole, validationCount, contratsRhCount, vocab);
  const sections = (!capGatingEnabled || capsLoading)
    ? rawSections
    : rawSections
        .map((s) => ({ ...s, items: s.items.filter((it) => !it.cap || caps.has(it.cap)) }))
        .filter((s) => s.items.length > 0);

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
