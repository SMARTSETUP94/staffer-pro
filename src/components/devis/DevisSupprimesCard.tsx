import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

/** Devis supprimés des 30 derniers jours, restaurables par un admin. */
export function DevisSupprimesCard() {
  const isAdmin = useCapability("section.admin");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["devis-supprimes"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_supprimes_lister");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!isAdmin) return null;
  const restaurer = async (id: string, numero: string) => {
    const { error } = await supabase.rpc("devis_restaurer", { _devis_id: id });
    if (error) return void toast.error("Restauration impossible", { description: error.message });
    toast.success(`Devis ${numero} restauré`);
    void q.refetch();
    void qc.invalidateQueries({ queryKey: ["devis-staffing-global"] });
    void qc.invalidateQueries({ queryKey: ["devis-pipeline-badges"] });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Devis supprimés</CardTitle>
        <CardDescription>Restaurables pendant 30 jours après leur suppression.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Devis</TableHead><TableHead>Affaire</TableHead><TableHead>Supprimé le</TableHead><TableHead>Par</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.numero}</TableCell>
                <TableCell>{r.affaire_nom ?? "—"}</TableCell>
                <TableCell>{new Date(r.supprime_le).toLocaleString("fr-FR")}</TableCell>
                <TableCell>{r.supprime_par_nom ?? "—"}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => void restaurer(r.id, r.numero)}>Restaurer</Button></TableCell>
              </TableRow>
            ))}
            {(q.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">{q.isLoading ? "Chargement…" : "Aucun devis supprimé."}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
