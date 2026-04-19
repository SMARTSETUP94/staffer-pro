import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, Settings, Shield, UserCog, UserPlus, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { inviteUser } from "@/lib/admin-actions";

export const Route = createFileRoute("/_app/parametres")({
  head: () => ({ meta: [{ title: "Paramètres — Planning chantiers" }] }),
  component: ParametresPage,
});

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  roles: AppRole[];
  created_at: string;
}

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  chef_chantier: "Chef d'équipe",
  employe: "Employé",
};

const ROLE_VARIANT: Record<AppRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  chef_chantier: "secondary",
  employe: "outline",
};

function ParametresPage() {
  const navigate = useNavigate();
  const { isAdmin, loading, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [pendingRoleAdd, setPendingRoleAdd] = useState<Record<string, AppRole>>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRoles, setInviteRoles] = useState<AppRole[]>(["employe"]);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/planning" });
  }, [loading, isAdmin, navigate]);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  async function loadUsers() {
    setLoadingUsers(true);
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, email, full_name, created_at")
      .order("email");
    if (pErr) {
      toast.error("Erreur chargement utilisateurs : " + pErr.message);
      setLoadingUsers(false);
      return;
    }
    const { data: roles, error: rErr } = await supabase
      .from("user_roles")
      .select("user_id, role");
    if (rErr) {
      toast.error("Erreur chargement rôles : " + rErr.message);
      setLoadingUsers(false);
      return;
    }
    const byUser = new Map<string, AppRole[]>();
    roles?.forEach((r) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      byUser.set(r.user_id, arr);
    });
    setUsers(
      (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        created_at: p.created_at,
        roles: (byUser.get(p.id) ?? []).sort(),
      })),
    );
    setLoadingUsers(false);
  }

  async function addRole(userId: string, role: AppRole) {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    toast.success(`Rôle ${ROLE_LABEL[role]} ajouté`);
    setPendingRoleAdd((p) => ({ ...p, [userId]: undefined as unknown as AppRole }));
    loadUsers();
  }

  async function removeRole(userId: string, role: AppRole) {
    if (userId === currentUser?.id && role === "admin") {
      toast.error("Vous ne pouvez pas retirer votre propre rôle admin");
      return;
    }
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role);
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    toast.success(`Rôle ${ROLE_LABEL[role]} retiré`);
    loadUsers();
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      toast.error("Email requis");
      return;
    }
    if (inviteRoles.length === 0) {
      toast.error("Sélectionnez au moins un rôle");
      return;
    }
    setInviting(true);
    try {
      await inviteUser({
        data: {
          email: inviteEmail.trim(),
          fullName: inviteFullName.trim() || undefined,
          roles: inviteRoles,
        },
      });
      toast.success(`Invitation envoyée à ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteFullName("");
      setInviteRoles(["employe"]);
      loadUsers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec de l'invitation";
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  }

  function toggleInviteRole(role: AppRole) {
    setInviteRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  if (loading || !isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Paramètres</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-primary" />
                <CardTitle>Utilisateurs &amp; rôles</CardTitle>
              </div>
              <CardDescription className="mt-1.5">
                Invitez de nouveaux utilisateurs et gérez leurs rôles. Un utilisateur peut cumuler plusieurs rôles.
              </CardDescription>
            </div>
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 shrink-0">
                  <UserPlus className="h-4 w-4" />
                  Inviter un utilisateur
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    Inviter un utilisateur
                  </DialogTitle>
                  <DialogDescription>
                    L'utilisateur recevra un email d'invitation pour définir son mot de passe et accéder à l'application.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-email">Email *</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="prenom.nom@exemple.fr"
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
                  <div className="space-y-2">
                    <Label>Rôles à attribuer *</Label>
                    <div className="space-y-2 rounded-md border p-3">
                      {(["admin", "chef_chantier", "employe"] as AppRole[]).map((r) => (
                        <label
                          key={r}
                          className="flex items-center gap-2 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={inviteRoles.includes(r)}
                            onCheckedChange={() => toggleInviteRole(r)}
                          />
                          <span className="flex items-center gap-1.5">
                            {r === "admin" && <Shield className="h-3.5 w-3.5 text-primary" />}
                            {ROLE_LABEL[r]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>
                    Annuler
                  </Button>
                  <Button onClick={handleInvite} disabled={inviting}>
                    {inviting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                    Envoyer l'invitation
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Aucun utilisateur.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Rôles actifs</TableHead>
                  <TableHead className="w-[260px]">Ajouter un rôle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const availableRoles = (["admin", "chef_chantier", "employe"] as AppRole[])
                    .filter((r) => !u.roles.includes(r));
                  const pending = pendingRoleAdd[u.id];
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.email}
                        {u.id === currentUser?.id && (
                          <Badge variant="outline" className="ml-2 text-[10px]">vous</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.full_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {u.roles.length === 0 && (
                            <span className="text-xs text-muted-foreground">Aucun</span>
                          )}
                          {u.roles.map((r) => (
                            <Badge
                              key={r}
                              variant={ROLE_VARIANT[r]}
                              className="gap-1 pr-1"
                            >
                              {r === "admin" && <Shield className="h-3 w-3" />}
                              {ROLE_LABEL[r]}
                              <button
                                onClick={() => removeRole(u.id, r)}
                                className="ml-0.5 rounded hover:bg-background/20 p-0.5"
                                title="Retirer ce rôle"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {availableRoles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Tous les rôles attribués</span>
                        ) : (
                          <div className="flex gap-2">
                            <Select
                              value={pending ?? ""}
                              onValueChange={(v) =>
                                setPendingRoleAdd((p) => ({ ...p, [u.id]: v as AppRole }))
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Choisir un rôle" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableRoles.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {ROLE_LABEL[r]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!pending}
                              onClick={() => pending && addRole(u.id, pending)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">À venir</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Gestion des métiers, seuils d'alerte planning, paramètres globaux.
        </CardContent>
      </Card>
    </div>
  );
}
