/**
 * Admin — Gestion des Feature Flags.
 *
 * CRUD complet sur la table `public.feature_flags` (RLS : admin only en écriture).
 *
 *  - Activer/désactiver globalement (enabled_globally)
 *  - Cibler des rôles (enabled_for_roles : admin, chef_chantier, employe, chef_metier_scoped, rh)
 *  - Cibler des utilisateurs (enabled_for_user_ids) — par email pour confort, résolu via profiles
 *  - Créer / éditer / supprimer un flag
 *
 * Pour consommer un flag côté client, utiliser `useFeatureFlag("ma_cle")`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, X, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/admin/feature-flags")({
  beforeLoad: () => requireCapability("admin.feature_flags.manage"),
  component: () => (
      <FeatureFlagsAdminPage />
  ),
});

import { USER_ROLE_OPTIONS, type AppRole as _AppRole } from "@/lib/labels";

type AppRole = _AppRole;

const ROLE_OPTIONS: { value: AppRole; label: string }[] = USER_ROLE_OPTIONS.map(
  ({ value, label }) => ({ value, label }),
);

interface FlagRow {
  flag_key: string;
  description: string | null;
  enabled_globally: boolean;
  enabled_for_user_ids: string[];
  enabled_for_roles: string[];
  created_at: string;
  updated_at: string;
}

function FeatureFlagsAdminPage() {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<FlagRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [toDelete, setToDelete] = useState<FlagRow | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("feature_flags")
      .select("*")
      .order("flag_key");
    if (error) {
      toast.error("Chargement impossible : " + error.message);
    } else {
      setFlags((data ?? []) as FlagRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flags;
    return flags.filter(
      (f) =>
        f.flag_key.toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q),
    );
  }, [flags, search]);

  async function toggleGlobal(flag: FlagRow, value: boolean) {
    const { error } = await supabase
      .from("feature_flags")
      .update({ enabled_globally: value })
      .eq("flag_key", flag.flag_key);
    if (error) {
      toast.error("Échec : " + error.message);
      return;
    }
    toast.success(value ? "Flag activé globalement" : "Flag désactivé globalement");
    load();
  }

  async function handleDelete(flag: FlagRow) {
    const { error } = await supabase
      .from("feature_flags")
      .delete()
      .eq("flag_key", flag.flag_key);
    if (error) {
      toast.error("Suppression impossible : " + error.message);
      return;
    }
    toast.success("Flag supprimé");
    setToDelete(null);
    load();
  }

  return (
    <div className="container mx-auto p-6 space-y-4">
      <PageHeader
        eyebrow="Admin / Plateforme"
        title="Feature Flags"
        description="Active progressivement les nouvelles features par rôle ou par utilisateur."
      />


      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Rechercher une clé ou description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex-1" />
            <Button
              onClick={() => {
                setIsNew(true);
                setEditing({
                  flag_key: "",
                  description: "",
                  enabled_globally: false,
                  enabled_for_user_ids: [],
                  enabled_for_roles: [],
                  created_at: "",
                  updated_at: "",
                });
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Nouveau flag
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Aucun feature flag. Crée le premier avec « Nouveau flag ».
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clé</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px]">Global</TableHead>
                  <TableHead>Rôles ciblés</TableHead>
                  <TableHead className="w-[100px]">Users</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => (
                  <TableRow key={f.flag_key}>
                    <TableCell className="font-mono text-xs">{f.flag_key}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-md">
                      {f.description || "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={f.enabled_globally}
                        onCheckedChange={(v) => toggleGlobal(f, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {f.enabled_for_roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          f.enabled_for_roles.map((r) => (
                            <Badge key={r} variant="secondary" className="text-xs">
                              {r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {f.enabled_for_user_ids.length}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setIsNew(false);
                            setEditing(f);
                          }}
                        >
                          Éditer
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToDelete(f)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editing && (
        <FlagEditDialog
          flag={editing}
          isNew={isNew}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le flag ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{toDelete?.flag_key}</span> sera supprimé.
              Tout code qui lit ce flag retournera <strong>false</strong> (fail-closed).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && handleDelete(toDelete)}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Edit dialog
// ──────────────────────────────────────────────────────────────

function FlagEditDialog({
  flag,
  isNew,
  onClose,
  onSaved,
}: {
  flag: FlagRow;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [flagKey, setFlagKey] = useState(flag.flag_key);
  const [description, setDescription] = useState(flag.description ?? "");
  const [enabledGlobally, setEnabledGlobally] = useState(flag.enabled_globally);
  const [roles, setRoles] = useState<string[]>(flag.enabled_for_roles);
  const [usersInput, setUsersInput] = useState(flag.enabled_for_user_ids.join("\n"));
  const [saving, setSaving] = useState(false);

  function toggleRole(role: AppRole) {
    setRoles((cur) =>
      cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role],
    );
  }

  async function handleSave() {
    const key = flagKey.trim();
    if (!key) {
      toast.error("La clé est obligatoire");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(key)) {
      toast.error("Clé invalide : minuscules, chiffres et _ uniquement");
      return;
    }
    const userIds = usersInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // Valider UUID format basique
    const badId = userIds.find((id) => !/^[0-9a-f-]{36}$/i.test(id));
    if (badId) {
      toast.error(`UUID invalide : ${badId}`);
      return;
    }

    setSaving(true);
    const payload = {
      flag_key: key,
      description: description.trim() || null,
      enabled_globally: enabledGlobally,
      enabled_for_roles: roles,
      enabled_for_user_ids: userIds,
    };

    const { error } = isNew
      ? await supabase.from("feature_flags").insert(payload)
      : await supabase
          .from("feature_flags")
          .update(payload)
          .eq("flag_key", flag.flag_key);

    setSaving(false);

    if (error) {
      toast.error("Échec : " + error.message);
      return;
    }
    toast.success(isNew ? "Flag créé" : "Flag mis à jour");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nouveau feature flag" : "Éditer le flag"}</DialogTitle>
          <DialogDescription>
            Un flag est <strong>activé</strong> pour un user si : global = ON, OU son uid ∈
            users, OU l'un de ses rôles ∈ roles. Sinon désactivé.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Clé (snake_case)</Label>
            <Input
              value={flagKey}
              onChange={(e) => setFlagKey(e.target.value)}
              placeholder="new_planning_hub"
              disabled={!isNew}
              className="font-mono"
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Refonte du hub planning (sprint 1)"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Activé globalement</Label>
              <p className="text-xs text-muted-foreground">
                Si ON, prend le pas sur les ciblages.
              </p>
            </div>
            <Switch checked={enabledGlobally} onCheckedChange={setEnabledGlobally} />
          </div>

          <div className="space-y-2">
            <Label>Rôles ciblés</Label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((r) => {
                const on = roles.includes(r.value);
                return (
                  <Button
                    key={r.value}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    onClick={() => toggleRole(r.value)}
                  >
                    {r.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>User IDs ciblés (un par ligne, UUID)</Label>
            <Textarea
              value={usersInput}
              onChange={(e) => setUsersInput(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              rows={3}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4 mr-1" /> Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
