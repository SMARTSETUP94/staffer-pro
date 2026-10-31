import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type MateriauResult = {
  id: string; fournisseur: string; fournisseur_etat: string; prix_public: boolean; famille: string | null;
  produit: string; ref: string | null; format_texte: string | null; longueur_mm: number | null; largeur_mm: number | null;
  epaisseur_mm: number | null; unite: string; prix_achat_net: number | null; prix_m2: number | null; prix_ml: number | null;
  date_tarif: string | null; remarque: string | null; cle_comparaison: string | null; moins_cher_du_groupe: boolean;
};

type Tri = "pertinence" | "prix" | "m2";

function useDebounced<T>(v: T, ms = 200) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

const eur = (n: number | null) => (n == null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");

/** Barre unique de recherche matériaux — ↑↓ Entrée, filtres en puces, tri. */
export function MateriauxRecherche({ onPick, autoFocus }: { onPick?: (m: MateriauResult) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [tri, setTri] = useState<Tri>("pertinence");
  const [recent, setRecent] = useState(false);
  const [famille, setFamille] = useState<string | null>(null);
  const [fournisseur, setFournisseur] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const dq = useDebounced(q);
  const listRef = useRef<HTMLDivElement>(null);

  const { data = [], isFetching } = useQuery({
    queryKey: ["materiaux-recherche", dq, tri, recent, famille, fournisseur],
    enabled: dq.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("materiaux_rechercher", {
        _q: dq, _tri: tri, _recent_seulement: recent,
        _familles: famille ? [famille] : (null as unknown as string[]),
        _fournisseurs: fournisseur ? [fournisseur] : (null as unknown as string[]),
      });
      if (error) throw error;
      return (data ?? []) as MateriauResult[];
    },
  });
  useEffect(() => setSel(0), [data]);

  const familles = [...new Set(data.map((d) => d.famille).filter(Boolean))] as string[];
  const fournisseurs = [...new Map(data.map((d) => [d.fournisseur, d])).values()];

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, data.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && data[sel] && onPick) { e.preventDefault(); onPick(data[sel]); }
  };
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className={`rounded-full border px-2 py-0.5 text-xs ${active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</button>
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input autoFocus={autoFocus} className="pl-8" placeholder="mdf 19, tube 40x40x2, dibond 3 blanc…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {chip(tri === "pertinence", "Pertinence", () => setTri("pertinence"))}
        {chip(tri === "prix", "Prix", () => setTri("prix"))}
        {chip(tri === "m2", "€/m²", () => setTri("m2"))}
        <span className="mx-1 text-muted-foreground">·</span>
        {chip(recent, "Tarif récent seulement", () => setRecent(!recent))}
        {familles.slice(0, 6).map((f) => chip(famille === f, f, () => setFamille(famille === f ? null : f)))}
        {fournisseurs.slice(0, 6).map((f) => chip(fournisseur === f.id, f.fournisseur, () => setFournisseur(null)))}
        {isFetching && <span className="text-xs text-muted-foreground">…</span>}
      </div>
      <div ref={listRef} className="max-h-96 divide-y overflow-auto rounded-md border">
        {dq.trim().length >= 2 && data.length === 0 && !isFetching && <p className="p-3 text-sm text-muted-foreground">Aucun résultat — ajoutez une ligne libre.</p>}
        {data.map((m, i) => (
          <button type="button" key={m.id} data-idx={i} onMouseEnter={() => setSel(i)} onClick={() => onPick?.(m)}
            className={`grid w-full grid-cols-[1fr_auto] gap-2 px-3 py-2 text-left text-sm ${i === sel ? "bg-muted" : ""}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-1 font-medium">
                <span className="truncate">{m.produit}</span>
                {m.moins_cher_du_groupe && <Badge className="h-4 px-1 text-[10px]">moins cher</Badge>}
                {m.remarque && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label={m.remarque} />}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {[m.format_texte ?? (m.longueur_mm ? `${m.longueur_mm}×${m.largeur_mm ?? ""}` : null), m.epaisseur_mm != null ? `ép. ${m.epaisseur_mm} mm` : null, m.fournisseur, m.unite].filter(Boolean).join(" · ")}
                {(m.fournisseur_etat !== "ok" || m.prix_public) && (
                  <span className="ml-1 text-destructive">{m.prix_public ? "prix public" : "tarif ancien"}{m.date_tarif ? ` (${new Date(m.date_tarif).toLocaleDateString("fr-FR", { month: "2-digit", year: "numeric" })})` : ""}</span>
                )}
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="font-medium">{eur(m.prix_achat_net)}</div>
              <div className="text-muted-foreground">{m.prix_m2 != null ? `${eur(m.prix_m2)}/m²` : m.prix_ml != null ? `${eur(m.prix_ml)}/ml` : ""}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
