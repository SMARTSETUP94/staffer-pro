import { Clock, Inbox, Trophy, FileText, UsersRound, Building2, GanttChart, Calendar, CalendarRange, Send, CalendarCheck, Users, Wallet, BadgeCheck, UserCircle, Settings, Warehouse, type LucideIcon } from "lucide-react";

export interface NavItem { title: string; url: string; icon: LucideIcon; cap?: string; flag?: string; subtitle?: string }
export interface NavSection { label: string; items: NavItem[] }
export const SIDEBAR_SECTIONS: NavSection[] = [
  { label: "Accueil", items: [{ title: "Aujourd'hui", url: "/", icon: Clock }] },
  { label: "Commercial", items: [
    { title: "Demandes clients", url: "/demandes-clients", icon: Inbox, cap: "demandes_clients.view" },
    { title: "Opportunités", url: "/opportunites", icon: Trophy, cap: "section.pipeline_opportunites" },
    { title: "Devis", url: "/devis-staffing", icon: FileText, cap: "devis.view", flag: "devis_staffing_v1" },
    { title: "Clients", url: "/clients", icon: UsersRound, cap: "clients.view" },
  ] },
  { label: "Affaires", items: [
    { title: "Chantiers", url: "/affaires", icon: Building2, cap: "section.affaires" },
    { title: "Documents par affaire", url: "/documents-affaires", icon: FileText, cap: "section.affaires" },
  ] },
  { label: "Plannings", items: [
    { title: "Planning atelier", url: "/planning-atelier", icon: GanttChart, cap: "section.affaires" },
    { title: "Planning bureau d'études", url: "/planning-be", icon: GanttChart, cap: "planning.pilotage" },
    { title: "Planning logistique", url: "/logistique", icon: Calendar, cap: "logistique.planning.view" },
    { title: "Planning opportunités", url: "/planning-opportunites", icon: CalendarRange, cap: "opportunites.planning.view", subtitle: "Prévisionnel" },
  ] },
  { label: "Logistique", items: [
    { title: "Demandes logistiques", url: "/demandes-logistique", icon: Inbox, cap: "logistique.planning.view" },
    { title: "Nouvelle demande", url: "/nouvelle-demande-logistique", icon: Send, cap: "logistique.planning.view" },
    { title: "Disponibilités intervenants", url: "/logistique/dispos", icon: CalendarCheck, cap: "dispos.view" },
  ] },
  { label: "Équipes", items: [
    { title: "Employés", url: "/employes", icon: Users, cap: "section.equipes" },
    { title: "Valider les notes de frais", url: "/validation-notes-de-frais", icon: Wallet, cap: "section.admin" },
  ] },
  { label: "Administration", items: [
    { title: "Qualité des données", url: "/admin/qualite-donnees", icon: BadgeCheck, cap: "section.admin" },
    { title: "Utilisateurs", url: "/admin/utilisateurs", icon: UserCircle, cap: "section.admin" },
    { title: "Connecteur Claude", url: "/admin/connecteur-claude", icon: Settings, cap: "api.mcp" },
    { title: "Devis (taux, matériaux, modèles)", url: "/parametres/devis-taux", icon: Settings, cap: "devis.parametres", subtitle: "Paramètres" },
    { title: "Référents par rôle", url: "/parametres/referents-roles", icon: UsersRound, cap: "section.admin" },
    { title: "Lien formulaire logistique", url: "/parametres/formulaire-logistique", icon: Settings, cap: "section.admin" },
    { title: "Lieux", url: "/parametres/lieux", icon: Warehouse, cap: "section.admin" },
  ] },
];
export function visibleSidebarSections(caps: Set<string>, devisStaffing: boolean): NavSection[] {
  return SIDEBAR_SECTIONS.map(section => ({ ...section, items: section.items.filter(item =>
    (!item.cap || caps.has(item.cap)) && (!item.flag || devisStaffing)
  ) })).filter(section => section.items.length > 0);
}
