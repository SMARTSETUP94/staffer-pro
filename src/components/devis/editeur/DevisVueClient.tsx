import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TYPE_LABEL, eur, fmtDate } from "./api";
import type { LigneType } from "@/lib/devis/calcul";

type CL = { id: string; parent_id: string | null; type: LigneType; ordre: number; libelle: string | null; quantite: number;
  descriptif_client: string | null; longueur_mm: number | null; largeur_mm: number | null; hauteur_mm: number | null; finition: string | null;
  texte: string | null; montant: number | null; sous_total: number | null };
type VC = { numero: string; libelle: string | null; date_devis: string | null; validite_jours: number | null;
  client: { nom: string; adresse: string | null; code_postal: string | null; ville: string | null } | null; client_final: string | null;
  contact: { nom: string; email: string | null } | null; dates: Record<string, string | null>; lignes: CL[];
  photos: { ligne_id: string; storage_path: string; thumb_path: string | null; legende: string | null; mime: string | null }[];
  total_ht: number; tva: number; tva_pct: number; ttc: number; options_ht: number };

const DATE_LABELS: [string, string][] = [
  ["date_devis", "Date du devis"], ["date_validite", "Valable jusqu'au"],
  ["date_visite_technique", "Visite technique"], ["date_montage", "Montage"], ["date_evenement_debut", "Événement du"],
  ["date_evenement_fin", "au"], ["date_demontage", "Démontage"],
];

/** Vue client : zones, objets, descriptifs, commentaires non internes, photos cochées, quantités, prix de vente et dates. */
export function DevisVueClient({ open, onOpenChange, devisId }: { open: boolean; onOpenChange: (o: boolean) => void; devisId: string }) {
  const q = useQuery({
    queryKey: ["devis-vue-client", devisId], enabled: open, staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_lire_client", { _devis_id: devisId });
      if (error) throw error;
      const vc = data as unknown as VC;
      const paths = vc.photos.filter((p) => p.mime !== "application/pdf").map((p) => p.thumb_path ?? p.storage_path);
      const urls = paths.length ? (await supabase.storage.from("devis-photos").createSignedUrls(paths, 3600)).data ?? [] : [];
      return { vc, urls: Object.fromEntries(urls.map((u) => [u.path, u.signedUrl])) };
    },
  });
  const vc = q.data?.vc;
  const kids = (p: string | null) => (vc?.lignes ?? []).filter((l) => l.parent_id === p).sort((a, b) => a.ordre - b.ordre);
  const render = (l: CL, depth: number): React.ReactNode => {
    const photos = (vc?.photos ?? []).filter((p) => p.ligne_id === l.id);
    if (l.type === "commentaire") return <p key={l.id} className="text-sm italic text-muted-foreground" style={{ marginLeft: depth * 16 }}>{l.texte}</p>;
    const dims = [l.longueur_mm, l.largeur_mm, l.hauteur_mm].filter((x) => x != null).join(" × ");
    return (
      <div key={l.id} className={depth === 0 ? "space-y-2 border-t pt-3" : "space-y-1"} style={{ marginLeft: depth * 16 }}>
        <div className="flex justify-between gap-4">
          <p className={depth === 0 ? "font-semibold" : "font-medium"}>
            {depth === 0 && <span className="mr-1 text-xs uppercase text-muted-foreground">{TYPE_LABEL[l.type]}</span>}
            {l.libelle}{l.type === "objet" && <span className="font-normal text-muted-foreground"> — qté {Number(l.quantite)}</span>}
          </p>
          <p className="tabular-nums">{depth === 0 ? eur(l.sous_total ?? 0) : l.montant ? eur(l.montant) : ""}</p>
        </div>
        {l.descriptif_client && <p className="whitespace-pre-line text-sm">{l.descriptif_client}</p>}
        {(dims || l.finition) && <p className="text-xs text-muted-foreground">{[dims && `${dims} mm`, l.finition].filter(Boolean).join(" · ")}</p>}
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => p.mime === "application/pdf"
              ? <span key={p.storage_path} className="rounded border px-2 py-1 text-xs">PDF {p.legende}</span>
              : <figure key={p.storage_path} className="w-40"><img src={q.data?.urls[p.thumb_path ?? p.storage_path]} alt={p.legende ?? ""} className="h-24 w-full rounded object-cover" />
                  {p.legende && <figcaption className="text-xs text-muted-foreground">{p.legende}</figcaption>}</figure>)}
          </div>
        )}
        {kids(l.id).map((k) => render(k, depth + 1))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
        <DialogHeader><DialogTitle>Vue client — {vc?.numero}</DialogTitle></DialogHeader>
        {!vc ? <p className="text-sm text-muted-foreground">Chargement…</p> : (
          <div className="space-y-4">
            <div className="grid gap-4 text-sm md:grid-cols-2">
              <div>
                <p className="font-medium">{vc.client?.nom ?? "Client à préciser"}</p>
                <p className="text-muted-foreground">{[vc.client?.adresse, [vc.client?.code_postal, vc.client?.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
                {vc.client_final && <p>Pour : {vc.client_final}</p>}
                {vc.contact && <p>À l'attention de {vc.contact.nom}</p>}
              </div>
              <div className="md:text-right">
                <p>Devis du {fmtDate(vc.date_devis)}</p>
                {vc.validite_jours && <p className="text-muted-foreground">Valable {vc.validite_jours} jours</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-md border p-2 text-sm md:grid-cols-5">
              {DATE_LABELS.map(([k, lbl]) => <div key={k}><p className="text-xs text-muted-foreground">{lbl}</p><p>{fmtDate(vc.dates?.[k])}</p></div>)}
            </div>
            {kids(null).map((l) => render(l, 0))}
            <div className="ml-auto w-64 space-y-1 border-t pt-2 text-sm">
              <div className="flex justify-between font-semibold"><span>Total HT</span><span>{eur(vc.total_ht)}</span></div>
              <div className="flex justify-between"><span>TVA {Number(vc.tva_pct)} %</span><span>{eur(vc.tva)}</span></div>
              <div className="flex justify-between"><span>Total TTC</span><span>{eur(vc.ttc)}</span></div>
              {Number(vc.options_ht) > 0 && <div className="flex justify-between text-muted-foreground"><span>Options (non incluses)</span><span>{eur(vc.options_ht)}</span></div>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
