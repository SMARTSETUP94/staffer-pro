import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/parametres/devis-modeles/")({
  beforeLoad: () => requireCapability("devis.parametres"),
  head: () => ({ meta: [{ title: "Modèles de devis — Paramètres" }] }),
  component: ModelesPage,
});

function ModelesPage() {
  const navigate = useNavigate();
  const [f, setF] = useState({ nom: "", categorie: "", description: "" });
  const q = useQuery({
    queryKey: ["devis-modeles-tous"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_modeles_lister", { _actifs_seulement: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const creer = async () => {
    const { data, error } = await supabase.rpc("devis_modele_creer_vierge", { _nom: f.nom.trim(), _categorie: f.categorie, _description: f.description });
    if (error) return toast.error(error.message);
    navigate({ to: "/parametres/devis-modeles/$devisId", params: { devisId: data as string } });
  };
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Modèles de devis</h1>
        <p className="text-sm text-muted-foreground">Un devis créé depuis un modèle reprend toute sa structure avec les taux en vigueur ; le modèle n'est jamais modifié.{" "}
          <Link to="/parametres/devis-taux" className="underline">Taux</Link> · <Link to="/parametres/devis-materiaux" className="underline">Matériaux</Link></p>
      </div>
      <Card>
        <CardHeader><CardTitle>Modèles</CardTitle><CardDescription>Aussi créables depuis un devis : « Enregistrer comme modèle ».</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader><TableRow><TableHead>Nom</TableHead><TableHead>Catégorie</TableHead><TableHead>Usage</TableHead><TableHead>Lignes</TableHead><TableHead>Actif</TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell><Link to="/parametres/devis-modeles/$devisId" params={{ devisId: m.id }} className="font-medium underline">{m.modele_nom}</Link></TableCell>
                  <TableCell>{m.modele_categorie ?? "—"}</TableCell>
                  <TableCell className="max-w-80 truncate text-sm text-muted-foreground">{m.modele_description ?? ""}</TableCell>
                  <TableCell>{m.nb_lignes}</TableCell>
                  <TableCell><Switch checked={m.modele_actif} onCheckedChange={async (v) => {
                    const { error } = await supabase.rpc("devis_modele_activer", { _devis_id: m.id, _actif: v });
                    if (error) toast.error(error.message); else q.refetch();
                  }} /></TableCell>
                </TableRow>
              ))}
              {(q.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Aucun modèle.</TableCell></TableRow>}
            </TableBody>
          </Table>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Input className="w-56" placeholder="Nom" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
            <Input className="w-56" placeholder="Catégorie" value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })} />
            <Input className="w-80" placeholder="Description d'usage" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <Button disabled={!f.nom.trim()} onClick={creer}><Plus className="mr-1 h-4 w-4" />Nouveau modèle vierge</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
