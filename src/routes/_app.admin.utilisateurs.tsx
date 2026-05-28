import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Loader2, Mail, Shield, UserCog, UserPlus, Send, Power, Trash2, MoreHorizontal,
  CheckCircle2, Clock, XCircle, Link2, Users, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";
import { supabase } from "@/integrations/supabase/client";
import {
  inviteUser, resendInvitation, updateUserRoles, setUserActive, deleteUser, linkExistingUsers,
  updateUserFullName,
} from "@/lib/admin-actions";
import { readServerFnError } from "@/lib/server-fn-error";
import { withAuthRetry } from "@/lib/with-auth-retry";
import { PageHeader } from "@/components/PageHeader";
import { BulkInviteDialog } from "@/components/admin/BulkInviteDialog";
import { UserCapsDebugModal } from "@/components/admin/UserCapsDebugModal";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { roleLabel } from "@/lib/labels";

export const Route = createFileRoute("/_app/admin/utilisateurs")({
  head: () => ({ meta: [{ title: "Utilisateurs — Paramètres" }] }),
  component: UtilisateursPage,
});

type UserStatus = "invite" | "actif" | "desactive";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  roles: AppRole[];
  status: UserStatus;
  invited_at: string | null;
  derniere_connexion_le: string | null;
  employe_label: string | null;
  employe_id: string | null;
}

// L3a — Groupement des 11 rôles par catégorie pour la grille de checkboxes.
// chef_metier_scoped est masqué de l'UI (legacy, conservé en DB pour rollback L5).
const ROLE_GROUPS: { label: string; roles: AppRole[] }[] = [
  { label: "Direction & Admin", roles: ["admin", "rh"] },
  { label: "Commerce & Étude", roles: ["commercial", "bureau_etude"] },
  { label: "Production & Chantier", roles: ["chef_chantier", "atelier_chef", "chef_pose"] },
  { label: "Terrain & Atelier", roles: ["atelier_metier", "poseur", "logistique"] },
  { label: "Défaut", roles: ["employe"] },
];


const STATUS_META: Record<
  UserStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  invite: {
    label: "Invité",
    icon: Clock,
    className: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  },
  actif: {
    label: "Actif",
    icon: CheckCircle2,
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
  desactive: {
    label: "Désactivé",
    icon: XCircle,
    className: "bg-muted text-muted-foreground border-border",
  },
};

function UtilisateursPage() {
  const navigate = useNavigate();
  const { loading, user: currentUser } = useAuth();
  const canAdmin = useCapability("section.admin");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [filterStatus, setFilterStatus] = useState<UserStatus | "all">("all");
  const [search, setSearch] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("chef_chantier");
  const [inviting, setInviting] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [capsDebug, setCapsDebug] = useState<UserRow | null>(null);

  useEffect(() => {
    if (!loading && !canAdmin) navigate({ to: "/" });
  }, [loading, canAdmin, navigate]);

  useEffect(() => {
    if (canAdmin) loadUsers();
  }, [canAdmin]);


  async function loadUsers() {
    setLoadingUsers(true);

    const [profilesQ, rolesQ, employesQ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, derniere_connexion_le")
        .order("email"),
      supabase
        .from("user_roles")
        .select("user_id, role, status, invited_at"),
      supabase
        .from("employes")
        .select("id, prenom, nom, email, profile_id"),
    ]);

    if (profilesQ.error) {
      toast.error("Erreur profiles : " + profilesQ.error.message);
      setLoadingUsers(false);
      return;
    }
    if (rolesQ.error) {
      toast.error("Erreur user_roles : " + rolesQ.error.message);
      setLoadingUsers(false);
      return;
    }

    // L3a — agrégation MULTI-rôles par user (+ statut prioritaire)
    const rolesByUser = new Map<
      string,
      { roles: AppRole[]; status: UserStatus; invited_at: string | null }
    >();
    rolesQ.data?.forEach((r) => {
      const existing = rolesByUser.get(r.user_id);
      const role = r.role as AppRole;
      const incomingStatus = r.status as UserStatus;
      if (!existing) {
        rolesByUser.set(r.user_id, {
          roles: [role],
          status: incomingStatus,
          invited_at: r.invited_at,
        });
      } else {
        if (!existing.roles.includes(role)) existing.roles.push(role);
        // Statut le plus "fort" : actif > invite > desactive
        const rank = (s: UserStatus) => (s === "actif" ? 0 : s === "invite" ? 1 : 2);
        if (rank(incomingStatus) < rank(existing.status)) existing.status = incomingStatus;
        if (!existing.invited_at && r.invited_at) existing.invited_at = r.invited_at;
      }
    });

    // Index employés par profile_id
    const empByProfile = new Map<
      string,
      { id: string; label: string }
    >();
    employesQ.data?.forEach((e) => {
      if (e.profile_id) {
        empByProfile.set(e.profile_id, {
          id: e.id,
          label: `${e.prenom} ${e.nom}`,
        });
      }
    });

    const rows: UserRow[] = (profilesQ.data ?? []).map((p) => {
      const r = rolesByUser.get(p.id);
      const emp = empByProfile.get(p.id);
      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        roles: r?.roles ?? [],
        status: r?.status ?? "actif",
        invited_at: r?.invited_at ?? null,
        derniere_connexion_le: p.derniere_connexion_le,
        employe_label: emp?.label ?? null,
        employe_id: emp?.id ?? null,
      };
    });
    setUsers(rows);
    setLoadingUsers(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filterStatus !== "all" && u.status !== filterStatus) return false;
      if (!q) return true;
      const hay = `${u.email} ${u.full_name ?? ""} ${u.employe_label ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, search, filterStatus]);

  const stats = useMemo(() => {
    let invite = 0, actif = 0, desactive = 0;
    for (const u of users) {
      if (u.status === "invite") invite++;
      else if (u.status === "actif") actif++;
      else if (u.status === "desactive") desactive++;
    }
    return { invite, actif, desactive, total: users.length };
  }, [users]);

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      toast.error("Email requis");
      return;
    }
    setInviting(true);
    try {
      const result = await withAuthRetry(() =>
        inviteUser({
          data: {
            email: inviteEmail.trim(),
            fullName: inviteFullName.trim() || undefined,
            roles: [inviteRole],
            siteUrl: typeof window !== "undefined" ? window.location.origin : undefined,
          },
        }),
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const linked = result.linkedEmployeId ? " (employé lié automatiquement)" : "";
      const idHint = result.messageId ? ` · id ${result.messageId.slice(0, 8)}` : "";
      toast.success(`Invitation envoyée à ${result.email}${linked}${idHint}`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteFullName("");
      setInviteRole("chef_chantier");
      loadUsers();
    } catch (e) {
      const msg = await readServerFnError(e);
      toast.error(msg || "Échec de l'invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleResend(u: UserRow) {
    setActingOn(u.id);
    try {
      await withAuthRetry(() => resendInvitation({ data: { targetUserId: u.id, siteUrl: typeof window !== "undefined" ? window.location.origin : undefined } }));
      toast.success(`Invitation renvoyée à ${u.email}`);
    } catch (e) {
      toast.error(await readServerFnError(e));
    } finally {
      setActingOn(null);
    }
  }

  async function handleSaveRoles(u: UserRow, nextRoles: AppRole[]) {
    // L3a — garde-fou : jamais d'utilisateur sans aucun rôle (sinon lockout).
    const safe = nextRoles.length === 0 ? (["employe"] as AppRole[]) : nextRoles;
    const forced = nextRoles.length === 0;
    setActingOn(u.id);
    try {
      await withAuthRetry(() =>
        updateUserRoles({ data: { targetUserId: u.id, roles: safe } }),
      );
      toast.success(
        forced
          ? `Rôle ${roleLabel("employe")} imposé par défaut à ${u.email} (aucun rôle sélectionné)`
          : `${safe.length} rôle${safe.length > 1 ? "s" : ""} appliqué${safe.length > 1 ? "s" : ""} à ${u.email}`,
      );
      loadUsers();
    } catch (e) {
      toast.error(await readServerFnError(e));
    } finally {
      setActingOn(null);
    }
  }

  async function handleToggleActive(u: UserRow) {
    setActingOn(u.id);
    try {
      const next = u.status === "desactive";
      await withAuthRetry(() => setUserActive({ data: { targetUserId: u.id, active: next } }));
      toast.success(next ? "Utilisateur réactivé" : "Utilisateur désactivé");
      loadUsers();
    } catch (e) {
      toast.error(await readServerFnError(e));
    } finally {
      setActingOn(null);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const u = confirmDelete;
    setConfirmDelete(null);
    setActingOn(u.id);
    try {
      await withAuthRetry(() => deleteUser({ data: { targetUserId: u.id } }));
      toast.success(`${u.email} supprimé`);
      loadUsers();
    } catch (e) {
      toast.error(await readServerFnError(e));
    } finally {
      setActingOn(null);
    }
  }

  async function handleLinkExisting() {
    setLinking(true);
    try {
      const result = await withAuthRetry(() =>
        linkExistingUsers({ data: undefined as never }),
      );
      if (result.lies === 0) {
        toast.info(`Aucun nouvel employé lié. ${result.orphelinsRestants} employé(s) sans compte associé.`);
      } else {
        toast.success(`${result.lies} employé(s) lié(s) automatiquement. ${result.orphelinsRestants} restant(s).`);
      }
      if (result.errors.length > 0) {
        console.warn("link errors:", result.errors);
      }
      loadUsers();
    } catch (e) {
      toast.error(await readServerFnError(e));
    } finally {
      setLinking(false);
    }
  }

  if (loading || !canAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Utilisateurs"
        description="Invitez les chefs d'équipe et employés, gérez leurs rôles et statuts."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleLinkExisting}
              disabled={linking}
              className="gap-1.5"
              title="Lie automatiquement les fiches employés aux comptes utilisateurs via correspondance email"
            >
              {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Auto-lier employés
            </Button>
            <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-1.5">
              <Users className="h-4 w-4" />
              Inviter en lot
            </Button>
            <Button onClick={() => setInviteOpen(true)} className="gap-1.5">
              <UserPlus className="h-4 w-4" />
              Inviter un utilisateur
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBlock label="Total" value={stats.total} className="bg-muted text-foreground" />
        <StatBlock label="Actifs" value={stats.actif} className="bg-emerald-500/10 text-emerald-700" />
        <StatBlock label="Invités" value={stats.invite} className="bg-amber-500/10 text-amber-700" />
        <StatBlock label="Désactivés" value={stats.desactive} className="bg-muted text-muted-foreground" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCog className="h-5 w-5 text-primary" />
              Liste des utilisateurs
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Rechercher email, nom…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full md:w-64"
              />
              <Select
                value={filterStatus}
                onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}
              >
                <SelectTrigger className="h-9 w-full md:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="actif">Actifs</SelectItem>
                  <SelectItem value="invite">Invités</SelectItem>
                  <SelectItem value="desactive">Désactivés</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun utilisateur ne correspond.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Employé lié</TableHead>
                  <TableHead>Dernière connexion</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const meta = STATUS_META[u.status];
                  const StatusIcon = meta.icon;
                  const isMe = u.id === currentUser?.id;
                  const busy = actingOn === u.id;
                  return (
                    <TableRow key={u.id} className={busy ? "opacity-60" : ""}>
                      <TableCell className="font-medium">
                        {u.email}
                        {isMe && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            vous
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <EditableFullName
                          userId={u.id}
                          value={u.full_name}
                          disabled={busy}
                          onSaved={(next) =>
                            setUsers((prev) =>
                              prev.map((row) => (row.id === u.id ? { ...row, full_name: next } : row)),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <RoleMultiSelectPopover
                          current={u.roles}
                          disabled={busy || (isMe && u.roles.includes("admin"))}
                          onSave={(next) => handleSaveRoles(u, next)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.className}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.employe_label ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Link2 className="h-3 w-3 text-emerald-600" />
                            {u.employe_label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">non lié</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.derniere_connexion_le ? (
                          <span title={format(new Date(u.derniere_connexion_le), "Pp", { locale: fr })}>
                            il y a{" "}
                            {formatDistanceToNow(new Date(u.derniere_connexion_le), { locale: fr })}
                          </span>
                        ) : u.status === "invite" && u.invited_at ? (
                          <span>Invité {formatDistanceToNow(new Date(u.invited_at), { locale: fr, addSuffix: true })}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={busy}
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setCapsDebug(u)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Caps effectives
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {u.status === "invite" && (
                              <DropdownMenuItem onClick={() => handleResend(u)}>
                                <Send className="mr-2 h-4 w-4" />
                                Renvoyer l'invitation
                              </DropdownMenuItem>
                            )}
                            {!isMe && (
                              <DropdownMenuItem onClick={() => handleToggleActive(u)}>
                                <Power className="mr-2 h-4 w-4" />
                                {u.status === "desactive" ? "Réactiver" : "Désactiver"}
                              </DropdownMenuItem>
                            )}
                            {!isMe && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setConfirmDelete(u)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Supprimer
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog d'invitation */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Inviter un utilisateur
            </DialogTitle>
            <DialogDescription>
              L'utilisateur recevra un email pour définir son mot de passe. Si son email
              correspond à une fiche employé, la liaison sera automatique.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="prenom.nom@setup.paris"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Nom complet (optionnel)</Label>
              <Input
                id="invite-name"
                placeholder="Prénom Nom"
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Rôle *</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_GROUPS.flatMap((g) => g.roles).map((r) => (
                    <SelectItem key={r} value={r}>
                      <span className="flex items-center gap-1.5">
                        {r === "admin" && <Shield className="h-3.5 w-3.5" />}
                        {roleLabel(r)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteOpen(false)}
              disabled={inviting}
            >
              Annuler
            </Button>
            <Button onClick={handleInvite} disabled={inviting}>
              {inviting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Envoyer l'invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Action <strong>irréversible</strong>. {confirmDelete?.email} perdra immédiatement
              tous ses accès. Si un employé est lié, la liaison sera supprimée (la fiche employé
              est conservée).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk invite */}
      <BulkInviteDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onComplete={loadUsers}
      />

      {/* L3a — Debug caps effectives */}
      <UserCapsDebugModal
        open={!!capsDebug}
        onOpenChange={(o) => !o && setCapsDebug(null)}
        targetUserId={capsDebug?.id ?? null}
        targetLabel={capsDebug?.full_name || capsDebug?.email || ""}
      />

    </div>
  );
}

/**
 * L3a — Popover de sélection multi-rôles (11 rôles groupés en 5 catégories).
 * Affiche les badges en cumul, applique le changement à la fermeture.
 */
function RoleMultiSelectPopover({
  current,
  disabled,
  onSave,
}: {
  current: AppRole[];
  disabled?: boolean;
  onSave: (next: AppRole[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AppRole[]>(current);

  useEffect(() => {
    if (!open) setDraft(current);
  }, [open, current]);

  const dirty =
    draft.length !== current.length || draft.some((r) => !current.includes(r));

  function toggle(role: AppRole) {
    setDraft((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function apply() {
    setOpen(false);
    if (dirty) onSave(draft);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-7 max-w-[260px] justify-start gap-1 px-2 text-xs"
          title="Cliquer pour modifier les rôles"
        >
          {current.length === 0 ? (
            <span className="italic text-muted-foreground">aucun rôle</span>
          ) : (
            <span className="flex flex-wrap items-center gap-1">
              {current.slice(0, 2).map((r) => (
                <Badge key={r} variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {r === "admin" && <Shield className="mr-0.5 h-2.5 w-2.5" />}
                  {roleLabel(r)}
                </Badge>
              ))}
              {current.length > 2 && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  +{current.length - 2}
                </Badge>
              )}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {ROLE_GROUPS.map((group) => (
            <div key={group.label} className="mb-3 last:mb-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-1.5">
                {group.roles.map((role) => {
                  const checked = draft.includes(role);
                  const id = `role-${role}`;
                  return (
                    <label
                      key={role}
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={() => toggle(role)}
                      />
                      <span className="flex-1">{roleLabel(role)}</span>
                      {role === "admin" && (
                        <Shield className="h-3 w-3 text-muted-foreground" />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2">
          <p
            className="text-[10px] text-muted-foreground"
            title="Si vous décochez tout, le rôle Employé sera imposé pour éviter un lockout."
          >
            {draft.length === 0
              ? "→ Employé imposé par défaut"
              : `${draft.length} rôle${draft.length > 1 ? "s" : ""} sélectionné${draft.length > 1 ? "s" : ""}`}
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setOpen(false)}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!dirty}
              onClick={apply}
            >
              Appliquer
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}


function StatBlock({
  label, value, className,
}: { label: string; value: number; className: string }) {
  return (
    <Card>
      <CardContent className={`flex flex-col gap-1 rounded-md p-4 ${className}`}>
        <span className="text-2xl font-bold leading-none">{value}</span>
        <span className="text-xs uppercase tracking-wider opacity-80">{label}</span>
      </CardContent>
    </Card>
  );
}

function EditableFullName({
  userId,
  value,
  disabled,
  onSaved,
}: {
  userId: string;
  value: string | null;
  disabled?: boolean;
  onSaved: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  async function commit() {
    const trimmed = draft.trim();
    const nextVal = trimmed.length === 0 ? null : trimmed;
    if (nextVal === (value ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await withAuthRetry(() =>
        updateUserFullName({ data: { targetUserId: userId, fullName: nextVal ?? "" } }),
      );
      onSaved(res.fullName ?? null);
      toast.success("Nom mis à jour");
      setEditing(false);
    } catch (e) {
      toast.error(await readServerFnError(e));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setEditing(true)}
        className="w-full rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        title="Cliquer pour éditer"
      >
        {value ?? <span className="italic opacity-60">— ajouter —</span>}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        disabled={saving}
        className="h-7 text-sm"
      />
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        disabled={saving}
        onClick={commit}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "OK"}
      </Button>
    </div>
  );
}
