import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Wrench, ArrowLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_app/devis/rattachement-historique")({
  head: () => ({
    meta: [
      { title: "Rattachement historique des devis — Admin" },
      {
        name: "description",
        content:
          "Outil admin pour rattacher les assignations et heures historiques au bon lot/devis (multi-devis).",
      },
    ],
  }),
  component: RattachementPage,
});

interface AffaireMulti {
  affaire_id: string;
  numero: string;
  nom: string;
  lots: { id: string; numero: string; libelle: string | null; statut: string }[];
  assignations_orphelines: number;
  heures_orphelines: number;
}

function RattachementPage() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AffaireMulti[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    // 1. Devis non terminés/clôturés groupés par affaire
    const { data: devisRows, error: devisErr } = await supabase
      .from("devis")
      .select("id, affaire_id, numero, libelle, statut")
      .neq("statut", "cloture");
    if (devisErr) {
      toast.error(devisErr.message);
      setLoading(false);
      return;
    }
    // 2. Affaires avec ≥2 devis
    const byAffaire = new Map<string, typeof devisRows>();
    (devisRows ?? []).forEach((d) => {
      if (!byAffaire.has(d.affaire_id)) byAffaire.set(d.affaire_id, []);
      byAffaire.get(d.affaire_id)!.push(d);
    });
    const affairesMulti = Array.from(byAffaire.entries()).filter(([, ds]) => ds.length >= 2);
    if (affairesMulti.length === 0) {
      setData([]);
      setLoading(false);
      return;
    }
    // 3. Détails affaires + comptes orphelins
    const ids = affairesMulti.map(([id]) => id);
    const { data: affRows } = await supabase
      .from("affaires")
      .select("id, numero, nom")
      .in("id", ids);
    const { data: assignOrph } = await supabase
      .from("assignations")
      .select("affaire_id")
      .in("affaire_id", ids)
      .is("devis_id", null);
    const { data: heuresOrph } = await supabase
      .from("heures_saisies")
      .select("affaire_id")
      .in("affaire_id", ids)
      .is("devis_id", null);
    const countAssign = new Map<string, number>();
    (assignOrph ?? []).forEach((r) =>
      countAssign.set(r.affaire_id, (countAssign.get(r.affaire_id) ?? 0) + 1),
    );
    const countHeures = new Map<string, number>();
    (heuresOrph ?? []).forEach((r) =>
      countHeures.set(r.affaire_id, (countHeures.get(r.affaire_id) ?? 0) + 1),
    );

    const result: AffaireMulti[] = affairesMulti.map(([affId, lots]) => {
      const aff = (affRows ?? []).find((a) => a.id === affId);
      return {
        affaire_id: affId,
        numero: aff?.numero ?? "?",
        nom: aff?.nom ?? "",
        lots: lots.map((l) => ({
          id: l.id,
          numero: l.numero,
          libelle: l.libelle,
          statut: l.statut,
        })),
        assignations_orphelines: countAssign.get(affId) ?? 0,
        heures_orphelines: countHeures.get(affId) ?? 0,
      };
    });
    result.sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }));
    setData(result);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  async function handleApply(affaireId: string) {
    const devisId = choices[affaireId];
    if (!devisId) {
      toast.error("Choisis un lot par défaut.");
      return;
    }
    setBusy(affaireId);
    try {
      const { error: e1 } = await supabase
        .from("assignations")
        .update({ devis_id: devisId })
        .eq("affaire_id", affaireId)
        .is("devis_id", null);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("heures_saisies")
        .update({ devis_id: devisId })
        .eq("affaire_id", affaireId)
        .is("devis_id", null);
      if (e2) throw e2;
      toast.success("Rattachement appliqué");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const totalOrphelins = useMemo(
    () =>
      data.reduce(
        (acc, a) => acc + a.assignations_orphelines + a.heures_orphelines,
        0,
      ),
    [data],
  );

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Accès restreint</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cette page est réservée aux administrateurs.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Rattachement historique des devis"
        description="Outil admin pour assigner un lot/devis aux assignations et heures orphelines (affaires multi-devis)."
      />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/devis">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Retour aux devis
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            Comment ça marche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Lors de la migration v0.15.1, les assignations et heures des affaires avec un seul
            devis actif ont été automatiquement rattachées. Les affaires multi-devis listées
            ci-dessous nécessitent un choix manuel.
          </p>
          <p>
            Pour chaque affaire, choisis un <strong>lot par défaut</strong> auquel rattacher
            toutes les assignations/heures orphelines. Tu pourras toujours réassigner une ligne
            individuellement après coup.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
              Tout est à jour
            </Badge>
            <p>
              Aucune affaire multi-devis avec des données orphelines. Le rattachement historique
              est complet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {data.length} affaire(s) multi-devis · {totalOrphelins} ligne(s) orpheline(s) au total
          </div>
          <div className="grid gap-3">
            {data.map((aff) => {
              const total = aff.assignations_orphelines + aff.heures_orphelines;
              const isDone = total === 0;
              return (
                <Card key={aff.affaire_id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="font-mono text-base">
                          {aff.numero} <span className="font-sans text-muted-foreground">— {aff.nom}</span>
                        </CardTitle>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {aff.lots.length} lots · {aff.assignations_orphelines} assignations
                          orphelines · {aff.heures_orphelines} heures orphelines
                        </div>
                      </div>
                      {isDone ? (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                          Rattaché
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/15 text-amber-700 border-amber-500/30">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          À rattacher
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isDone ? (
                      <p className="text-sm text-muted-foreground">
                        Aucune ligne orpheline — rien à faire.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[260px] flex-1">
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Rattacher toutes les lignes orphelines au lot :
                          </label>
                          <Select
                            value={choices[aff.affaire_id] ?? ""}
                            onValueChange={(v) =>
                              setChoices((p) => ({ ...p, [aff.affaire_id]: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choisir un lot…" />
                            </SelectTrigger>
                            <SelectContent>
                              {aff.lots.map((l) => (
                                <SelectItem key={l.id} value={l.id}>
                                  <span className="font-mono font-semibold">{l.numero}</span>
                                  {l.libelle && (
                                    <span className="ml-1.5 text-muted-foreground">
                                      — {l.libelle}
                                    </span>
                                  )}
                                  <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                                    ({l.statut})
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          onClick={() => handleApply(aff.affaire_id)}
                          disabled={busy === aff.affaire_id || !choices[aff.affaire_id]}
                        >
                          {busy === aff.affaire_id && (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          )}
                          Appliquer
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
