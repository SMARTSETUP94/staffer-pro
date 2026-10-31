import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { useCapability } from "@/hooks/use-capability";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { STATUT_LABEL, eur, type DevisStatut } from "@/components/devis/editeur/api";

export const Route = createFileRoute("/_app/affaires/$affaireId/devis-staffing/")({
  head: () => ({ meta: [{ title: "Devis de l'affaire" }] }),
  component: DevisListe,
});

function DevisListe() {
  const { affaireId } = Route.useParams();
  const navigate = useNavigate();
  const on = useFeatureFlag("devis_staffing_v1");
  const canWrite = useCapability("devis.rediger");
  const [open, setOpen] = useState(false);
  const [modele, setModele] = useState<string>("");

  const liste = useQuery({
    queryKey: ["devis-staffing-liste", affaireId],
    enabled: on,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_lister", { _affaire_id: affaireId });
      if (error) throw error;
      return data ?? [];
    },
  });
  const modeles = useQuery({
    queryKey: ["devis-modeles-actifs"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_modeles_lister", { _actifs_seulement: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!on) return <p className="p-6 text-sm text-muted-foreground">Fonction non activée.</p>;

  const creer = async () => {
    const { data, error } = await supabase.rpc("devis_creer", { _affaire_id: affaireId, _modele_id: (modele || null) as string });
    if (error) return toast.error(error.message);
    setOpen(false);
    navigate({ to: "/affaires/$affaireId/devis-staffing/$devisId", params: { affaireId, devisId: data as string } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Devis</h2>
        {canWrite && <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Nouveau devis</Button>}
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Numéro</TableHead><TableHead>Version</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Total HT</TableHead>
          <TableHead>Date du devis</TableHead><TableHead>Auteur</TableHead><TableHead>Modèle d'origine</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {(liste.data ?? []).length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Aucun devis pour l'instant.</TableCell></TableRow>
          )}
          {(liste.data ?? []).map((d) => (
            <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate({ to: "/affaires/$affaireId/devis-staffing/$devisId", params: { affaireId, devisId: d.id } })}>
              <TableCell className="font-medium"><FileText className="mr-1 inline h-4 w-4" />{d.numero}</TableCell>
              <TableCell>R{d.version}</TableCell>
              <TableCell><Badge variant="secondary">{STATUT_LABEL[d.statut_redaction as DevisStatut]}</Badge></TableCell>
              <TableCell className="text-right">{eur(d.total_ht)}</TableCell>
              <TableCell>{d.date_devis ? new Date(d.date_devis).toLocaleDateString("fr-FR") : "—"}</TableCell>
              <TableCell>{d.auteur ?? "—"}</TableCell>
              <TableCell>{d.modele_origine ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau devis</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!modele} onChange={() => setModele("")} />Devis vierge</label>
            {(modeles.data ?? []).map((m) => (
              <label key={m.id} className="flex items-start gap-2 text-sm">
                <input type="radio" className="mt-1" checked={modele === m.id} onChange={() => setModele(m.id)} />
                <span><span className="font-medium">{m.modele_nom}</span> {m.modele_categorie && <Badge variant="outline" className="ml-1">{m.modele_categorie}</Badge>}
                  {m.modele_description && <span className="block text-xs text-muted-foreground">{m.modele_description}</span>}</span>
              </label>
            ))}
          </div>
          <DialogFooter><Button onClick={creer}>Créer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="text-xs text-muted-foreground"><Link to="/affaires/$affaireId" params={{ affaireId }}>← Synthèse</Link></p>
    </div>
  );
}
