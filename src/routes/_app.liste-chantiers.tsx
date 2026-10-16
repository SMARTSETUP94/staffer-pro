import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireCapability } from "@/lib/capability-guard";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

function ListeChantiers() {
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "4" | "6">("tous");
  const { data, isLoading } = useQuery({
    queryKey: ["liste-chantiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affaires")
        .select("id, numero, nom, client, lieu, statut, code_opportunite, date_montage, date_demontage, charge:profiles!affaires_charge_affaires_id_fkey(prenom, nom)")
        .eq("phase", "signe")
        .is("archived_at", null)
        .order("numero", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter(
      (a) =>
        /^[46]\d{3}$/.test(a.numero) &&
        (filtre === "tous" || a.numero.startsWith(filtre)) &&
        (!s || [a.numero, a.nom, a.client, a.lieu].some((v) => (v ?? "").toLowerCase().includes(s))),
    );
  }, [data, q, filtre]);

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-3xl font-bold">Liste des chantiers</h1>
        <p className="text-sm text-muted-foreground">{rows.length} chantiers montage/démontage (4XXX) et fabrication (6XXX)</p>
      </div>
      <div className="flex flex-wrap gap-2">
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
      </div>
      <Card className="overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">N°</th><th className="p-2">Nom</th><th className="p-2">Client</th><th className="p-2">Lieu</th>
                <th className="p-2">Chargé d'affaires</th><th className="p-2">Opp.</th><th className="p-2">Montage</th><th className="p-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const c = a.charge as { prenom?: string | null; nom?: string | null } | null;
                return (
                  <tr key={a.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-2 font-bold">
                      <Link to="/affaires/$affaireId" params={{ affaireId: a.id }} className="text-primary hover:underline">{a.numero}</Link>
                    </td>
                    <td className="p-2">{a.nom}</td>
                    <td className="p-2">{a.client ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{a.lieu ?? "—"}</td>
                    <td className="p-2">{c ? `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() : "—"}</td>
                    <td className="p-2">{a.code_opportunite ?? "—"}</td>
                    <td className="p-2">{a.date_montage ? new Date(a.date_montage).toLocaleDateString("fr-FR") : "—"}</td>
                    <td className="p-2"><Badge variant="outline">{STATUT[a.statut] ?? a.statut}</Badge></td>
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
