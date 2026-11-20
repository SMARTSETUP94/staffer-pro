import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STATUT_LABEL } from "@/lib/opportunites";
import { eur } from "@/components/devis/editeur/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function OpportunitesCloses({ recherche, chargeId }: { recherche: string; chargeId: string }) {
  const q = useQuery({ queryKey: ["opportunites-closes"], queryFn: async () => {
    const r = await supabase.rpc("list_opportunites_closes");
    if (r.error) throw r.error;
    const rows = r.data ?? [];
    const ids = rows.map(r => r.id);
    const [d, a] = await Promise.all([
      supabase.rpc("devis_retenu_pipeline", { _affaire_ids: ids }),
      supabase.from("affaires").select("id,ca_estime_ht").in("id", ids),
    ]);
    if (d.error || a.error) throw d.error ?? a.error;
    return rows.map(r => ({ ...r, montant: d.data?.find(d => d.affaire_id === r.id)?.net_ht ?? a.data?.find(a => a.id === r.id)?.ca_estime_ht ?? null }));
  } });
  if (q.isLoading) return <p className="py-6 text-muted-foreground">Chargement…</p>;
  if (q.error) return <p className="py-6 text-destructive">{q.error.message}</p>;
  const rows = (q.data ?? []).filter(r => (chargeId === "__all__" || r.charge_affaires_id === chargeId) && `${r.numero} ${r.nom} ${r.client}`.toLowerCase().includes(recherche.trim().toLowerCase()));
  return <div><p className="mb-3 text-sm text-muted-foreground">{rows.length} opportunités closes</p><Table>
    <TableHeader><TableRow><TableHead>Affaire</TableHead><TableHead>Client</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Montant HT</TableHead><TableHead>Modifiée le</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map(r => <TableRow key={r.id}><TableCell>{r.numero} · {r.nom}</TableCell><TableCell>{r.client}</TableCell><TableCell>{STATUT_LABEL[r.statut_opportunite]}</TableCell><TableCell className="text-right tabular-nums">{eur(r.montant)}</TableCell><TableCell>{r.statut_change_le ? new Date(r.statut_change_le).toLocaleDateString("fr-FR") : "—"}</TableCell></TableRow>)}</TableBody>
  </Table></div>;
}