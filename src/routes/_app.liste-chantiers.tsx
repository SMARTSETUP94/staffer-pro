import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireCapability } from "@/lib/capability-guard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/liste-chantiers")({
  beforeLoad: () => requireCapability("section.affaires"),
  head: () => ({
    meta: [
      { title: "Liste des chantiers — Staffing Setup Paris" },
      { name: "description", content: "Liste des chantiers montage/démontage (4XXX) et fabrication (6XXX)." },
      { property: "og:title", content: "Liste des chantiers — Staffing Setup Paris" },
      { property: "og:description", content: "Liste des chantiers 4XXX et 6XXX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListeChantiers,
});

const STATUT: Record<string, string> = { prospect: "Prospect", en_cours: "En cours", termine: "Terminé", annule: "Annulé" };
const STATUT_OPTIONS = ["prospect", "en_cours", "termine", "annule"] as const;

type ChantierStatut = (typeof STATUT_OPTIONS)[number];

type ChantierRow = {
  id: string;
  numero: string;
  nom: string | null;
  client: string | null;
  lieu: string | null;
  statut: ChantierStatut;
  archived_at: string | null;
  code_opportunite: string | null;
  date_montage: string | null;
  charge: { full_name?: string | null } | null;
};

function ListeChantiers() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "4" | "6">("tous");
  const [voirArchives, setVoirArchives] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["liste-chantiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affaires")
        .select("id, numero, nom, client, lieu, statut, archived_at, code_opportunite, date_montage, charge:profiles!affaires_charge_affaires_id_fkey(full_name)")
        .eq("phase", "signe")
        .order("numero", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChantierRow[];
    },
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? [])
      .filter((a) => (voirArchives ? true : !a.archived_at))
      .filter(
        (a) =>
          /^[46]\d{3}$/.test(a.numero) &&
          (filtre === "tous" || a.numero.startsWith(filtre)) &&
          (!s || [a.numero, a.nom, a.client, a.lieu].some((v) => (v ?? "").toLowerCase().includes(s))),
      );
  }, [data, q, filtre, voirArchives]);

  const nbArchives = (data ?? []).filter((a) => a.archived_at).length;

  async function patchChantier(id: string, patch: Partial<Pick<ChantierRow, "statut" | "archived_at">>) {
    setBusyId(id);
    const { error } = await supabase.from("affaires").update(patch).eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error("Modification impossible", { description: error.message });
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: ["liste-chantiers"] });
    return true;
  }

  async function changeStatut(a: ChantierRow, statut: ChantierStatut) {
    if (statut === a.statut) return;
    if (await patchChantier(a.id, { statut })) {
      toast.success(`Chantier ${a.numero} : ${STATUT[statut] ?? statut}`);
    }
  }

  async function basculerArchive(a: ChantierRow) {
    const archive = !a.archived_at;
    if (await patchChantier(a.id, { archived_at: archive ? new Date().toISOString() : null })) {
      toast.success(archive ? `Chantier ${a.numero} archivé` : `Chantier ${a.numero} désarchivé`);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-3xl font-bold">Liste des chantiers</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} chantiers montage/démontage (4XXX) et fabrication (6XXX)
          {nbArchives > 0 ? ` · ${nbArchives} archivé${nbArchives > 1 ? "s" : ""}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="N°, nom, client, lieu…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        {(["tous", "4", "6"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltre(f)}
            className={`rounded-md border px-3 text-sm ${filtre === f ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
          >
            {f === "tous" ? "Tous" : f === "4" ? "Montage/Démontage 4XXX" : "Fabrication 6XXX"}
          </button>
        ))}
        <Button
          variant={voirArchives ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setVoirArchives((v) => !v)}
          disabled={nbArchives === 0 && !voirArchives}
        >
          <Archive className="mr-1.5 h-4 w-4" />
          {voirArchives ? "Masquer les archivés" : "Voir les archivés"}
          {nbArchives > 0 && !voirArchives ? ` (${nbArchives})` : ""}
        </Button>
      </div>
      <Card className="overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">N°</th><th className="p-2">Nom</th><th className="p-2">Client</th><th className="p-2">Lieu</th>
                <th className="p-2">Chargé d'affaires</th><th className="p-2">Opp.</th><th className="p-2">Montage</th>
                <th className="p-2">Statut</th><th className="p-2">Archiver</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const c = a.charge as { full_name?: string | null } | null;
                return (
                  <tr key={a.id} className={`border-t border-border hover:bg-muted/30 ${a.archived_at ? "opacity-60" : ""}`}>
                    <td className="p-2 font-bold">
                      <Link to="/affaires/$affaireId" params={{ affaireId: a.id }} className="text-primary hover:underline">{a.numero}</Link>
                    </td>
                    <td className="p-2">{a.nom}</td>
                    <td className="p-2">{a.client ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{a.lieu ?? "—"}</td>
                    <td className="p-2">{c?.full_name ?? "—"}</td>
                    <td className="p-2">{a.code_opportunite ?? "—"}</td>
                    <td className="p-2">{a.date_montage ? new Date(a.date_montage).toLocaleDateString("fr-FR") : "—"}</td>
                    <td className="p-2">
                      {busyId === a.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Select value={a.statut} onValueChange={(v) => changeStatut(a, v)}>
                          <SelectTrigger className="h-8 w-[130px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUT_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>{STATUT[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="p-2">
                      {busyId === a.id ? (
                        <span className="inline-block w-8" />
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={a.archived_at ? "Désarchiver" : "Archiver"}
                          onClick={() => basculerArchive(a)}
                        >
                          {a.archived_at ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
