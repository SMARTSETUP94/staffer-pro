import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarPlus, Download, FileText, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { requireCapability } from "@/lib/capability-guard";
import { useCapability } from "@/hooks/use-capability";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { JalonnementDialog } from "@/components/logistique/JalonnementDialog";
import { useAffairesPourLogistique } from "@/hooks/use-etapes-logistiques";
import type { JalonnementResult } from "@/lib/server-fns/jalonnement.functions";

export const Route = createFileRoute("/_app/jalonnements")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({
    meta: [
      { title: "Jalonnements — plannings déposés et analysés" },
      { name: "description", content: "Déposez les plannings et jalonnements d'événement : l'IA les lit, les rattache à un chantier et propose les étapes logistiques." },
      { property: "og:title", content: "Jalonnements — plannings déposés et analysés" },
      { property: "og:description", content: "Plannings et jalonnements analysés par l'IA et rattachés aux chantiers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JalonnementsPage,
});

type Row = {
  id: string; affaire_id: string | null; nom_fichier: string; storage_path: string;
  resultat_ia: JalonnementResult | null; statut: string; nb_etapes_planifiees: number; created_at: string;
};

const STATUT: Record<string, { label: string; v: "default" | "secondary" | "destructive" }> = {
  a_valider: { label: "À planifier", v: "secondary" },
  planifie: { label: "Planifié", v: "default" },
  erreur: { label: "Erreur", v: "destructive" },
};

function JalonnementsPage() {
  const qc = useQueryClient();
  const canEdit = useCapability("logistique.etape.edit");
  const { data: affaires = [] } = useAffairesPourLogistique();
  const label = useMemo(() => new Map(affaires.map((a) => [a.id, `${a.numero} · ${a.nom}`])), [affaires]);
  const [q, setQ] = useState("");
  const [depot, setDepot] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["jalonnements"],
    queryFn: async () => {
      const { data, error } = await supabase.from("jalonnements")
        .select("id,affaire_id,nom_fichier,storage_path,resultat_ia,statut,nb_etapes_planifiees,created_at")
        .order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["jalonnements"] });

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const t = `${r.nom_fichier} ${label.get(r.affaire_id ?? "") ?? ""} ${r.resultat_ia?.nom_evenement ?? ""} ${r.resultat_ia?.lieu ?? ""}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => t.includes(w));
  });

  async function rattacher(r: Row, affaireId: string) {
    const { error } = await supabase.from("jalonnements").update({ affaire_id: affaireId || null }).eq("id", r.id);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function ouvrir(r: Row) {
    const { data, error } = await supabase.storage.from("jalonnements").createSignedUrl(r.storage_path, 300);
    if (error || !data) return toast.error("Fichier introuvable");
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function supprimer(r: Row) {
    if (!confirm(`Supprimer « ${r.nom_fichier} » ? Les étapes déjà ajoutées au planning restent.`)) return;
    await supabase.storage.from("jalonnements").remove([r.storage_path]);
    const { error } = await supabase.from("jalonnements").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="Jalonnements" description="Plannings et jalonnements déposés : fichier conservé, analyse IA sauvegardée, rattachement au chantier."
        actions={canEdit ? <Button size="sm" onClick={() => setDepot(true)}><Upload className="mr-1 h-4 w-4" />Déposer un jalonnement</Button> : undefined} />
      <Input placeholder="Rechercher (fichier, chantier, événement, lieu)" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun jalonnement pour l'instant.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const s = STATUT[r.statut] ?? STATUT.a_valider;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="min-w-48 flex-1">
                  <div className="font-medium">{r.resultat_ia?.nom_evenement || r.nom_fichier}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.nom_fichier} · {format(parseISO(r.created_at), "d MMM yyyy HH:mm", { locale: fr })}
                    {r.resultat_ia && ` · ${r.resultat_ia.etapes.length} date(s) lue(s)`}
                    {r.resultat_ia?.lieu && ` · ${r.resultat_ia.lieu}`}
                  </div>
                  {r.resultat_ia?.resume && <div className="mt-1 line-clamp-2 text-xs">{r.resultat_ia.resume}</div>}
                </div>
                <Badge variant={s.v}>{s.label}{r.statut === "planifie" && ` · ${r.nb_etapes_planifiees} étape(s)`}</Badge>
                <select className="h-9 max-w-56 rounded-md border border-input bg-background px-2 text-sm" value={r.affaire_id ?? ""}
                  disabled={!canEdit} onChange={(e) => rattacher(r, e.target.value)} aria-label="Chantier rattaché">
                  <option value="">— chantier non rattaché —</option>
                  {affaires.map((a) => <option key={a.id} value={a.id}>{a.numero} · {a.nom}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={() => ouvrir(r)}><Download className="mr-1 h-4 w-4" />Fichier</Button>
                {canEdit && r.resultat_ia && (
                  <Button size="sm" onClick={() => setOpen(r)}>
                    {r.statut === "planifie" ? <Sparkles className="mr-1 h-4 w-4" /> : <CalendarPlus className="mr-1 h-4 w-4" />}
                    {r.statut === "planifie" ? "Revoir" : "Planifier"}
                  </Button>
                )}
                {canEdit && <Button size="icon" variant="ghost" onClick={() => supprimer(r)} aria-label="Supprimer"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
              </div>
            );
          })}
        </div>
      )}

      <JalonnementDialog open={depot} onOpenChange={setDepot} onChanged={refresh} />
      <JalonnementDialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }} onChanged={refresh}
        saved={open && open.resultat_ia ? { id: open.id, result: open.resultat_ia, affaireId: open.affaire_id } : undefined} />
    </div>
  );
}
