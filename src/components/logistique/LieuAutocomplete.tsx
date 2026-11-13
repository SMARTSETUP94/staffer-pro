import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, MapPin, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

interface LieuStat { lieu: string; count: number; last: string }

/** Lieux déjà saisis sur les étapes logistiques, triés récents puis fréquents. */
function useLieuxConnus() {
  return useQuery({
    queryKey: ["lieux-logistique-connus"],
    staleTime: 60_000,
    queryFn: async (): Promise<LieuStat[]> => {
      const { data, error } = await supabase
        .from("affaire_etapes_logistiques")
        .select("lieu_libre, updated_at")
        .not("lieu_libre", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const map = new Map<string, LieuStat>();
      for (const r of data ?? []) {
        const lieu = (r.lieu_libre ?? "").trim();
        if (!lieu) continue;
        const k = lieu.toLowerCase();
        const cur = map.get(k);
        if (cur) cur.count++;
        else map.set(k, { lieu, count: 1, last: r.updated_at ?? "" });
      }
      return [...map.values()];
    },
  });
}

/** Adresses enregistrées (fournisseurs, entrepôts…) partagées avec la Flotte. */
function useAdressesEnregistrees() {
  return useQuery({
    queryKey: ["adresses-favorites-lieux"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("adresses_favorites").select("id, nom, adresse_complete, type").order("nom");
      if (error) throw error;
      return (data ?? []).map((a) => ({ ...a, lieu: `${a.nom} — ${a.adresse_complete}` }));
    },
  });
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function LieuAutocomplete({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const { data: lieux = [] } = useLieuxConnus();
  const { data: enregistrees = [] } = useAdressesEnregistrees();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const q0 = norm(value.trim());
  const dejaEnregistree = !q0 || enregistrees.some((a) => norm(a.lieu) === q0 || norm(a.adresse_complete) === q0);
  const favs = useMemo(() => {
    const words = q0.split(/\s+/).filter(Boolean);
    return enregistrees.filter((a) => norm(a.lieu) !== q0 && words.every((w) => norm(a.lieu).includes(w))).slice(0, 8);
  }, [enregistrees, q0]);

  async function enregistrer() {
    const texte = value.trim();
    const nom = window.prompt("Nom du fournisseur (ex. Richardson Plastiques) :", texte.split(/[,—-]/)[0].trim().slice(0, 80));
    if (!nom?.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("adresses_favorites").insert({ nom: nom.trim(), adresse_complete: texte, type: "fournisseur" });
    setSaving(false);
    if (error) { toast.error("Adresse non enregistrée", { description: "Seuls les chefs d'équipe et les admins peuvent enregistrer une adresse." }); return; }
    toast.success("Adresse fournisseur enregistrée");
    qc.invalidateQueries({ queryKey: ["adresses-favorites-lieux"] });
  }

  const { recents, frequents } = useMemo(() => {
    const q = norm(value.trim());
    const words = q.split(/\s+/).filter(Boolean);
    const match = lieux.filter((l) => {
      const n = norm(l.lieu);
      return n !== q && words.every((w) => n.includes(w));
    });
    const recents = [...match].sort((a, b) => b.last.localeCompare(a.last)).slice(0, 5);
    const seen = new Set(recents.map((l) => l.lieu));
    const frequents = [...match].filter((l) => !seen.has(l.lieu))
      .sort((a, b) => b.count - a.count).slice(0, 5);
    return { recents, frequents };
  }, [lieux, value]);

  const show = open && (favs.length > 0 || recents.length > 0 || frequents.length > 0);
  const item = (l: LieuStat, icon: React.ReactNode) => (
    <button key={l.lieu} type="button"
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
      onMouseDown={(e) => { e.preventDefault(); onChange(l.lieu); setOpen(false); }}>
      {icon}<span className="flex-1 truncate">{l.lieu}</span>
      <span className="text-xs text-muted-foreground">{l.count}×</span>
    </button>
  );

  return (
    <div className="relative">
      <Input value={value} placeholder={placeholder ?? "Rechercher ou saisir une adresse"}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} />
      {show && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-md">
          {favs.length > 0 && <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Adresses enregistrées</div>}
          {favs.map((a) => (
            <button key={a.id} type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => { e.preventDefault(); onChange(a.lieu); setOpen(false); }}>
              <Star className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 truncate"><span className="font-medium">{a.nom}</span> · {a.adresse_complete}</span>
            </button>
          ))}
          {recents.length > 0 && <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Dernières adresses</div>}
          {recents.map((l) => item(l, <Clock className="h-3.5 w-3.5 text-muted-foreground" />))}
          {frequents.length > 0 && <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Les plus utilisées</div>}
          {frequents.map((l) => item(l, <MapPin className="h-3.5 w-3.5 text-muted-foreground" />))}
        </div>
      )}
      {!dejaEnregistree && (
        <button type="button" disabled={saving} onClick={enregistrer}
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50">
          <Star className="h-3 w-3" /> Enregistrer comme adresse fournisseur
        </button>
      )}
    </div>
  );
}
