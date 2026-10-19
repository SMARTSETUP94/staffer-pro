import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NoteFraisDialog, type NoteFraisRow } from "@/components/notes-frais/NoteFraisDialog";
import { NDF_STATUTS, categorieLabel, formatEur } from "@/lib/notes-frais";

export const Route = createFileRoute("/_app/mes-notes-de-frais")({
  head: () => ({
    meta: [
      { title: "Mes notes de frais — Setup Paris" },
      { name: "description", content: "Saisissez vos dépenses avec photo du ticket lue par l'IA et suivez leur validation." },
      { property: "og:title", content: "Mes notes de frais — Setup Paris" },
      { property: "og:description", content: "Saisie des notes de frais avec lecture automatique du ticket." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MesNotesDeFrais,
});

export type NoteAvecChantier = NoteFraisRow & { affaires: { numero: string | null; nom: string } | null };
export const NDF_SELECT = "id,user_id,date_depense,fournisseur,categorie,montant_ttc,taux_tva,montant_tva,montant_ht,affaire_id,chantier_libre,commentaire,justificatif_path,statut,motif_rejet,created_at,affaires(numero,nom)";

function MesNotesDeFrais() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<NoteFraisRow | null>(null);
  const { data: rows = [] } = useQuery({
    queryKey: ["mes-notes-de-frais", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("notes_de_frais").select(NDF_SELECT)
        .eq("user_id", user!.id).order("date_depense", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as NoteAvecChantier[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["mes-notes-de-frais"] });
  const total = (s: string) => rows.filter((r) => r.statut === s).reduce((a, r) => a + Number(r.montant_ttc), 0);

  async function remove(r: NoteFraisRow) {
    if (!confirm("Supprimer cette note de frais ?")) return;
    if (r.justificatif_path) await supabase.storage.from("notes-de-frais").remove([r.justificatif_path]);
    const { error } = await supabase.from("notes_de_frais").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Mes notes de frais" description="Prends ton ticket en photo : l'IA remplit les champs, tu vérifies et tu envoies." />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />Nouvelle note de frais</Button>
        <div className="ml-auto flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">En attente {formatEur(total("en_attente"))}</Badge>
          <Badge>Validées {formatEur(total("validee"))}</Badge>
          <Badge variant="outline">Remboursées {formatEur(total("remboursee"))}</Badge>
        </div>
      </div>
      <div className="divide-y rounded-md border">
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Aucune note de frais pour l'instant.</p>}
        {rows.map((r) => {
          const editable = r.statut === "en_attente" || r.statut === "rejetee";
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <div className="w-20 text-muted-foreground">{format(parseISO(r.date_depense), "d MMM yy", { locale: fr })}</div>
              <button className="min-w-0 flex-1 text-left disabled:cursor-default" disabled={!editable} onClick={() => { setEdit(r); setOpen(true); }}>
                <div className="font-medium">{r.fournisseur}</div>
                <div className="text-xs text-muted-foreground">{categorieLabel(r.categorie)} · {r.affaires ? `${r.affaires.numero ?? ""} ${r.affaires.nom}` : r.chantier_libre}</div>
                {r.statut === "rejetee" && r.motif_rejet && <div className="text-xs text-destructive">Motif : {r.motif_rejet} — clique pour corriger et renvoyer</div>}
              </button>
              <div className="text-right"><div className="font-semibold">{formatEur(r.montant_ttc)}</div><div className="text-xs text-muted-foreground">HT {formatEur(r.montant_ht)}</div></div>
              <Badge variant={NDF_STATUTS[r.statut]?.variant}>{NDF_STATUTS[r.statut]?.label ?? r.statut}</Badge>
              {editable && <Button size="icon" variant="ghost" aria-label="Supprimer" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          );
        })}
      </div>
      <NoteFraisDialog open={open} onOpenChange={setOpen} note={edit} onSaved={refresh} />
    </div>
  );
}
