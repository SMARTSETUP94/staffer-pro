import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { repriseClassementPj } from "@/lib/server-fns/classement-pj.functions";

type Bilan = { rattachees: number; deja_classees: number; a_traiter: number; traitees: number; resultats: { id: string; etat: string; erreur?: string }[] };

/** Reprise admin des demandes déjà rattachées : bilan affiché d'abord, traitement par lots de 10 seulement après confirmation. */
export function RepriseClassementPj() {
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (confirmer: boolean) => {
    setBusy(true);
    try { setBilan(await repriseClassementPj({ data: { confirmer, lot: 10 } }) as Bilan); }
    catch (e) { toast.error("Reprise impossible", { description: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <section className="rounded-md border p-4 space-y-3 text-sm">
      <div>
        <h3 className="font-medium">Pièces jointes des demandes déjà rattachées</h3>
        <p className="text-muted-foreground">Classe dans la boîte de documents de l'affaire les pièces jointes des demandes déjà rattachées. Outlook reste en lecture seule ; les logos de signature sont écartés ; vous êtes inscrit comme auteur des documents.</p>
      </div>
      {bilan && (
        <p>{bilan.rattachees} demandes rattachées · {bilan.deja_classees} déjà classées · <b>{bilan.a_traiter} à traiter</b>
          {bilan.traitees > 0 && <> · lot traité : {bilan.resultats.filter((r) => r.etat === "classe").length} classées, {bilan.resultats.filter((r) => r.etat !== "classe").length} à revoir</>}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(false)}>{busy && !bilan ? "Calcul…" : "Voir le bilan"}</Button>
        {bilan && bilan.a_traiter > 0 && (
          <Button size="sm" disabled={busy} onClick={() => { if (window.confirm(`Classer les pièces jointes de ${Math.min(10, bilan.a_traiter)} demandes (sur ${bilan.a_traiter}) ?`)) void run(true); }}>
            {busy ? "Classement…" : "Classer un lot de 10"}
          </Button>
        )}
      </div>
    </section>
  );
}
