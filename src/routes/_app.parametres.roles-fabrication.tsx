import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useProfilesWithRoles, type ProfileRole } from "@/hooks/use-fabrication";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_app/parametres/roles-fabrication")({
  head: () => ({ meta: [{ title: "Rôles fabrication — Setup Paris" }] }),
  component: RolesFabricationPage,
});

type FlagKey = "est_chef_projet" | "est_bureau_etude" | "est_respo_fab" | "est_finition" | "est_manutention";

const FLAGS: { key: FlagKey; label: string; description: string }[] = [
  { key: "est_chef_projet", label: "Chef projet", description: "Pilote l'affaire de bout en bout (1 par affaire)." },
  { key: "est_bureau_etude", label: "Bureau d'étude", description: "Conçoit et prépare les plans (étape BE)." },
  { key: "est_respo_fab", label: "Respo Fab", description: "Responsable d'objets en fabrication (plusieurs par affaire possible)." },
  { key: "est_finition", label: "Finition", description: "Peintres, tapissiers, finisseurs." },
  { key: "est_manutention", label: "Manutention", description: "Préparation pour livraison, chargement." },
];

function RolesFabricationPage() {
  const { isAdmin } = useAuth();
  const { profiles, loading, reload } = useProfilesWithRoles();
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Map<string, Partial<Record<FlagKey, boolean>>>>(new Map());
  const [saving, setSaving] = useState(false);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  const filtered = profiles.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.full_name?.toLowerCase().includes(q) ?? false) || p.email.toLowerCase().includes(q);
  });

  const getValue = (p: ProfileRole, key: FlagKey): boolean => {
    const draft = drafts.get(p.id);
    if (draft && key in draft) return draft[key] as boolean;
    return p[key];
  };

  const setDraftValue = (id: string, key: FlagKey, value: boolean) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      const current = next.get(id) ?? {};
      next.set(id, { ...current, [key]: value });
      return next;
    });
  };

  const dirtyCount = drafts.size;

  const handleSaveAll = async () => {
    if (dirtyCount === 0) return;
    setSaving(true);
    let okCount = 0;
    let errCount = 0;
    for (const [id, patch] of drafts.entries()) {
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) errCount += 1;
      else okCount += 1;
    }
    setSaving(false);
    if (errCount === 0) {
      toast.success(`${okCount} profil${okCount > 1 ? "s" : ""} mis à jour`);
    } else {
      toast.error(`${okCount} OK · ${errCount} erreur${errCount > 1 ? "s" : ""}`);
    }
    setDrafts(new Map());
    void reload();
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Rôles fabrication"
        description="Active les rôles atelier indépendamment du métier principal. Utilisé pour filtrer les assignees dans le module Fabrication."
      />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Rechercher un utilisateur…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={handleSaveAll} disabled={dirtyCount === 0 || saving} className="rounded-xl">
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Enregistrer ({dirtyCount})
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
        {FLAGS.map((f) => (
          <div key={f.key} className="rounded-lg border border-border bg-card/50 p-2 text-xs">
            <p className="font-semibold">{f.label}</p>
            <p className="text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                {FLAGS.map((f) => (
                  <TableHead key={f.key} className="w-32 text-center">{f.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className={drafts.has(p.id) ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}>
                  <TableCell>
                    <div className="font-medium">{p.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                  </TableCell>
                  {FLAGS.map((f) => (
                    <TableCell key={f.key} className="text-center">
                      <Switch
                        checked={getValue(p, f.key)}
                        onCheckedChange={(v) => setDraftValue(p.id, f.key, v)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Aucun utilisateur trouvé.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
