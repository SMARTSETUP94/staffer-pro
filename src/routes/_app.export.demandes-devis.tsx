import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  FileQuestion,
  Loader2,
  Copy,
  Check,
  Mail,
  Truck,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/PageHeader";
import {
  buildDemandeDevisTexte,
  TRAJET_CATEGORIE_LABEL as CATEGORIE_LABEL,
} from "@/lib/demande-devis-helpers";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_app/export/demandes-devis")({
  head: () => ({ meta: [{ title: "Demandes transport — Logistique" }] }),
  component: DemandesDevisPage,
});

type Trajet = Tables<"trajets">;
type Affaire = Pick<Tables<"affaires">, "id" | "numero" | "nom" | "client" | "lieu">;

interface TrajetEnrichi extends Trajet {
  affaire: Affaire | null;
}

function DemandesDevisPage() {
  const [loading, setLoading] = useState(true);
  const [trajets, setTrajets] = useState<TrajetEnrichi[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("trajets")
      .select(
        "*, affaire:affaire_id(id, numero, nom, client, lieu)",
      )
      .eq("statut_soustraitance", "a_sous_traiter")
      .order("date", { ascending: true })
      .order("heure_depart", { ascending: true });
    if (error) {
      toast.error("Échec du chargement : " + error.message);
      setLoading(false);
      return;
    }
    setTrajets((data as unknown as TrajetEnrichi[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Regroupement par affaire (les trajets sans affaire vont dans "Autres")
  const groupes = useMemo(() => {
    const map = new Map<string, { affaire: Affaire | null; trajets: TrajetEnrichi[] }>();
    trajets.forEach((t) => {
      const key = t.affaire?.id ?? "__none__";
      if (!map.has(key)) map.set(key, { affaire: t.affaire, trajets: [] });
      map.get(key)!.trajets.push(t);
    });
    return Array.from(map.values()).sort((a, b) => {
      const an = a.affaire?.numero ?? "zzz";
      const bn = b.affaire?.numero ?? "zzz";
      return an.localeCompare(bn);
    });
  }, [trajets]);

  function buildTexteDevis(g: { affaire: Affaire | null; trajets: TrajetEnrichi[] }) {
    return buildDemandeDevisTexte(g.affaire, g.trajets);
  }

  async function handleCopy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success("Texte copié dans le presse-papiers");
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      toast.error("Impossible de copier — copie manuellement le texte");
    }
  }

  async function handleMarquerEnvoye(trajetIds: string[]) {
    if (trajetIds.length === 0) return;
    setUpdatingId(trajetIds.join(","));
    const { error } = await supabase
      .from("trajets")
      .update({
        statut_soustraitance: "devis_envoye",
        soustraitance_envoye_le: new Date().toISOString(),
      })
      .in("id", trajetIds);
    setUpdatingId(null);
    if (error) {
      toast.error("Échec de la mise à jour : " + error.message);
      return;
    }
    toast.success(
      trajetIds.length > 1
        ? `${trajetIds.length} trajets marqués comme envoyés`
        : "Trajet marqué comme envoyé",
    );
    await refresh();
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        number="07"
        eyebrow="Logistique / Sous-traitance"
        title="Demandes transport"
        description="Trajets en attente d'envoi à un sous-traitant transport"
      />

      {trajets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileQuestion className="h-10 w-10 text-muted-foreground" />
            <p className="text-base font-semibold">Aucune demande en attente</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Marque un trajet comme « À sous-traiter » dans le planning Flotte pour qu'il
              apparaisse ici, prêt à être envoyé en demande de devis.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to="/planning">
                Aller au planning <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 p-3 text-sm">
            <Truck className="h-4 w-4 text-primary" />
            <span className="font-semibold">{trajets.length} trajet{trajets.length > 1 ? "s" : ""}</span>
            <span className="text-muted-foreground">
              regroupé{trajets.length > 1 ? "s" : ""} en {groupes.length} demande
              {groupes.length > 1 ? "s" : ""} de devis
            </span>
          </div>

          {groupes.map((g, idx) => {
            const key = g.affaire?.id ?? `none-${idx}`;
            const texte = buildTexteDevis(g);
            const ids = g.trajets.map((t) => t.id);
            const isUpdating = updatingId === ids.join(",");
            return (
              <Card key={key}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Mail className="h-4 w-4 text-primary" />
                        {g.affaire ? (
                          <>
                            <span className="font-mono text-primary">{g.affaire.numero}</span>
                            <span className="truncate">{g.affaire.nom}</span>
                          </>
                        ) : (
                          <span>Trajets sans affaire</span>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {g.trajets.length} trajet{g.trajets.length > 1 ? "s" : ""}
                        {g.affaire?.client ? ` · ${g.affaire.client}` : ""}
                        {g.affaire?.lieu ? ` · ${g.affaire.lieu}` : ""}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      À envoyer
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="divide-y rounded-md border bg-muted/10 text-xs">
                    {g.trajets.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-start gap-2 px-3 py-2">
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {format(new Date(t.date + "T00:00:00"), "EEE d MMM", { locale: fr })}
                          {t.heure_depart ? ` · ${t.heure_depart.slice(0, 5)}` : ""}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">
                            {CATEGORIE_LABEL[t.categorie] ?? t.categorie}
                          </div>
                          <div className="text-muted-foreground truncate">
                            {t.adresse_depart} → {t.adresse_arrivee}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Texte de la demande
                    </label>
                    <Textarea
                      value={texte}
                      readOnly
                      className="min-h-[180px] font-mono text-xs"
                      onClick={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
                    />
                  </div>

                  <Separator />

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(key, texte)}
                    >
                      {copiedKey === key ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Copié
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4" />
                          Copier le texte
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleMarquerEnvoye(ids)}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="mr-2 h-4 w-4" />
                      )}
                      Marquer envoyé
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

