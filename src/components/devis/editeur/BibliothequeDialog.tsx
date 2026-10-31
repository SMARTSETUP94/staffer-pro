import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { eur } from "./api";

/** Insérer un objet d'un autre devis ou d'un modèle (toute sa fiche est copiée, taux du jour). */
export function BibliothequeDialog({ open, onOpenChange, devisId, onInsert }: {
  open: boolean; onOpenChange: (o: boolean) => void; devisId: string; onInsert: (ligneId: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 200); return () => clearTimeout(t); }, [q]);
  const res = useQuery({
    queryKey: ["devis-bibliotheque", dq], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_bibliotheque_rechercher", { _q: dq });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bibliothèque d'objets</DialogTitle></DialogHeader>
        <Input autoFocus placeholder="Rechercher un objet (comptoir, totem…)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-96 divide-y overflow-auto rounded-md border">
          {(res.data ?? []).filter((r) => r.source !== devisId).map((r) => (
            <button type="button" key={r.ligne_id} onClick={() => void onInsert(r.ligne_id)} className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
              <span>
                <span className="font-medium">{r.libelle}</span>
                <Badge variant={r.source_est_modele ? "default" : "outline"} className="ml-2 text-[10px]">{r.source}</Badge>
                {r.descriptif_client && <span className="block truncate text-xs text-muted-foreground">{r.descriptif_client}</span>}
              </span>
              <span className="shrink-0 text-xs tabular-nums">{r.montant ? eur(r.montant) : ""}</span>
            </button>
          ))}
          {(res.data ?? []).length === 0 && <p className="p-3 text-sm text-muted-foreground">Aucun objet trouvé.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
