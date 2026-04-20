import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Loader2, Mail, Shield, UserCog, UserPlus, Send, Power, Trash2, MoreHorizontal,
  CheckCircle2, Clock, XCircle, Link2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  inviteUser, resendInvitation, updateUserRole, setUserActive, deleteUser,
} from "@/lib/admin-actions";
import { PageHeader } from "@/components/PageHeader";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_app/parametres/utilisateurs")({
  head: () => ({ meta: [{ title: "Utilisateurs — Paramètres" }] }),
  component: UtilisateursPage,
});

type UserStatus = "invite" | "actif" | "desactive";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole | null;
  status: UserStatus;
  invited_at: string | null;
  derniere_connexion_le: string | null;
  employe_label: string | null;
  employe_id: string | null;
}

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  chef_chantier: "Chef d'équipe",
  employe: "Employé",
};

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
  const { isAdmin, loading, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [filterStatus, setFilterStatus] = useState<UserStatus | "all">("all");
  const [search, setSearch] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("employe");
  const [inviting, setInviting] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard" });
  }, [loading, isAdmin, navigate]);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

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

    // Index : 1 ligne par user (rôle prioritaire admin > chef > employe)
    const rolesByUser = new Map<
      string,
      { role: AppRole; status: UserStatus; invited_at: string | null }
    >();
    rolesQ.data?.forEach((r) => {
      const existing = rolesByUser.get(r.user_id);
      const incoming = {
        role: r.role as AppRole,
        status: r.status as UserStatus,
        invited_at: r.invited_at,
      };
      if (!existing) {
        rolesByUser.set(r.user_id, incoming);
      } else {
        const order = (x: AppRole) =>
          x === "admin" ? 0 : x === "chef_chantier" ? 1 : 2;
        if (order(incoming.role) < order(existing.role)) {
          rolesByUser.set(r.user_id, incoming);
        }
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
        role: r?.role ?? null,
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
      const result = await inviteUser({
        data: {
          email: inviteEmail.trim(),
          fullName: inviteFullName.trim() || undefined,
          roles: [inviteRole],
        },
      });
      const linked = result.linkedEmployeId ? " (employé lié automatiquement)" : "";
      toast.success(`Invitation envoyée à ${result.email}${linked}`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteFullName("");
      setInviteRole("employe");
      loadUsers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec de l'invitation";
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  }

  async function handleResend(u: UserRow) {
    setActingOn(u.id);
    try {
      await resendInvitation({ data: { targetUserId: u.id } });
      toast.success(`Invitation renvoyée à ${u.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setActingOn(null);
    }
  }

  async function handleChangeRole(u: UserRow, role: AppRole) {
    setActingOn(u.id);
    try {
      await updateUserRole({ data: { targetUserId: u.id, role } });
      toast.success(`Rôle ${ROLE_LABEL[role]} appliqué à ${u.email}`);
      loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setActingOn(null);
    }
  }

  async function handleToggleActive(u: UserRow) {
    setActingOn(u.id);
    try {
      const next = u.status === "desactive";
      await setUserActive({ data: { targetUserId: u.id, active: next } });
      toast.success(next ? "Utilisateur réactivé" : "Utilisateur désactivé");
      loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
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
      await deleteUser({ data: { targetUserId: u.id } });
      toast.success(`${u.email} supprimé`);
      loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setActingOn(null);
    }
  }

  if (loading || !isAdmin) {
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
          <Button onClick={() => setInviteOpen(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Inviter un utilisateur
          </Button>
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
                      <TableCell className="text-muted-foreground">
                        {u.full_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {u.role ? (
                          <Select
                            value={u.role}
                            onValueChange={(v) => handleChangeRole(u, v as AppRole)}
                            disabled={busy || (isMe && u.role === "admin")}
                          >
                            <SelectTrigger className="h-7 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">
                                <span className="flex items-center gap-1.5">
                                  <Shield className="h-3 w-3" />
                                  Admin
                                </span>
                              </SelectItem>
                              <SelectItem value="chef_chantier">Chef d'équipe</SelectItem>
                              <SelectItem value="employe">Employé</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
                  <SelectItem value="admin">
                    <span className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      Admin
                    </span>
                  </SelectItem>
                  <SelectItem value="chef_chantier">Chef d'équipe</SelectItem>
                  <SelectItem value="employe">Employé</SelectItem>
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

      <p className="text-xs text-muted-foreground">
        <Link to="/parametres" className="underline">← Retour aux paramètres</Link>
      </p>
    </div>
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
