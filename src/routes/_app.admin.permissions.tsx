/**
 * Admin — Gestion des Capabilities (matrice rôle × permission).
 *
 * Édite la table `public.role_capabilities`. RLS : admin only en écriture.
 *
 * UI : matrice à cases à cocher, capabilities en lignes (groupées par catégorie),
 * rôles en colonnes. Toggle = upsert immédiat avec optimistic update + toast.
 *
 * Hook côté app : `useCapability("planning.edit")` lit la matrice consolidée.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { requireCapability } from "@/lib/capability-guard";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/admin/permissions")({
  beforeLoad: () => requireCapability("admin.permissions.manage"),
  component: () => (
    <RoleGuard required="admin">
      <PermissionsAdminPage />
    </RoleGuard>
  ),
});

type AppRole = "admin" | "chef_chantier" | "chef_metier_scoped" | "rh" | "employe";

const ROLES: { value: AppRole; label: string; hint?: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "chef_chantier", label: "Chef chantier", hint: "global" },
  { value: "chef_metier_scoped", label: "Chef métier", hint: "scopé" },
  { value: "rh", label: "RH" },
  { value: "employe", label: "Employé" },
];

const CATEGORY_LABELS: Record<string, string> = {
  planning: "Planning",
  staffing: "Staffing",
  affaires: "Affaires",
  devis: "Devis",
  heures: "Heures",
  rh: "Employés & RH",
  parametres: "Paramètres",
  admin: "Admin plateforme",
};

interface Capability {
  key: string;
  label: string;
  description: string | null;
  category: string;
  sort_order: number;
}

interface RoleCapRow {
  role: AppRole;
  capability: string;
  granted: boolean;
}

function PermissionsAdminPage() {
  const qc = useQueryClient();

  const capsQuery = useQuery({
    queryKey: ["admin", "capabilities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capabilities")
        .select("*")
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return data as Capability[];
    },
  });

  const matrixQuery = useQuery({
    queryKey: ["admin", "role-capabilities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_capabilities")
        .select("role, capability, granted");
      if (error) throw error;
      return data as RoleCapRow[];
    },
  });

  const matrix = useMemo(() => {
    const m = new Map<string, boolean>();
    (matrixQuery.data ?? []).forEach((r) => {
      m.set(`${r.role}:${r.capability}`, r.granted);
    });
    return m;
  }, [matrixQuery.data]);

  const grouped = useMemo(() => {
    const g: Record<string, Capability[]> = {};
    (capsQuery.data ?? []).forEach((c) => {
      if (!g[c.category]) g[c.category] = [];
      g[c.category].push(c);
    });
    return g;
  }, [capsQuery.data]);

  const [pending, setPending] = useState<Set<string>>(new Set());

  const toggleMutation = useMutation({
    mutationFn: async ({
      role, capability, granted,
    }: { role: AppRole; capability: string; granted: boolean }) => {
      const { error } = await supabase
        .from("role_capabilities")
        .upsert(
          { role, capability, granted },
          { onConflict: "role,capability" },
        );
      if (error) throw error;
    },
    onMutate: async ({ role, capability, granted }) => {
      const cellKey = `${role}:${capability}`;
      setPending((s) => new Set(s).add(cellKey));
      await qc.cancelQueries({ queryKey: ["admin", "role-capabilities"] });
      const prev = qc.getQueryData<RoleCapRow[]>(["admin", "role-capabilities"]);
      qc.setQueryData<RoleCapRow[]>(["admin", "role-capabilities"], (old) => {
        const list = old ? [...old] : [];
        const idx = list.findIndex((r) => r.role === role && r.capability === capability);
        if (idx >= 0) list[idx] = { ...list[idx], granted };
        else list.push({ role, capability, granted });
        return list;
      });
      return { prev, cellKey };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin", "role-capabilities"], ctx.prev);
      toast.error("Erreur d'enregistrement", { description: (err as Error).message });
    },
    onSuccess: () => {
      // Invalide aussi le cache des hooks useCapability côté app
      qc.invalidateQueries({ queryKey: ["capabilities"] });
    },
    onSettled: (_d, _e, _v, ctx) => {
      if (ctx?.cellKey) {
        setPending((s) => {
          const n = new Set(s);
          n.delete(ctx.cellKey);
          return n;
        });
      }
    },
  });

  const isLoading = capsQuery.isLoading || matrixQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin / Plateforme"
        title="Permissions par rôle"
        description="Matrice fine des capabilities. Toute modification est appliquée immédiatement et journalisée."
      />

      <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20">
        <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-200">
          <p>
            <strong>Important</strong> — Les capabilities pilotent l'affichage et certaines actions UI.
            La RLS DB reste la couche de sécurité finale. Désactiver une capability ne supprime pas
            l'accès en base si une policy reste permissive.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card border-b">
                <tr>
                  <th className="text-left p-3 font-medium min-w-[280px]">Capability</th>
                  {ROLES.map((r) => (
                    <th key={r.value} className="p-3 text-center font-medium min-w-[120px]">
                      <div>{r.label}</div>
                      {r.hint && (
                        <div className="text-[10px] font-normal text-muted-foreground">
                          {r.hint}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([category, caps]) => (
                  <RoleCapsCategoryRows
                    key={category}
                    category={category}
                    caps={caps}
                    matrix={matrix}
                    pending={pending}
                    onToggle={(role, capability, granted) =>
                      toggleMutation.mutate({ role, capability, granted })
                    }
                  />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RoleCapsCategoryRows({
  category, caps, matrix, pending, onToggle,
}: {
  category: string;
  caps: Capability[];
  matrix: Map<string, boolean>;
  pending: Set<string>;
  onToggle: (role: AppRole, capability: string, granted: boolean) => void;
}) {
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={ROLES.length + 1} className="p-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {CATEGORY_LABELS[category] ?? category}
          <Badge variant="outline" className="ml-2">{caps.length}</Badge>
        </td>
      </tr>
      {caps.map((cap) => (
        <tr key={cap.key} className="border-b last:border-0 hover:bg-muted/30">
          <td className="p-3 align-top">
            <div className="font-medium">{cap.label}</div>
            <div className="text-xs text-muted-foreground font-mono">{cap.key}</div>
            {cap.description && (
              <div className="text-xs text-muted-foreground mt-0.5">{cap.description}</div>
            )}
          </td>
          {ROLES.map((r) => {
            const cellKey = `${r.value}:${cap.key}`;
            const granted = matrix.get(cellKey) ?? false;
            const isPending = pending.has(cellKey);
            const isAdminLocked = r.value === "admin"; // l'admin garde tout
            return (
              <td key={r.value} className="p-3 text-center">
                {isPending ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Checkbox
                    checked={granted}
                    disabled={isAdminLocked}
                    onCheckedChange={(checked) =>
                      onToggle(r.value, cap.key, Boolean(checked))
                    }
                    aria-label={`${r.label} — ${cap.label}`}
                  />
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
