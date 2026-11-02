import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Syn = { id: string; groupe: string; terme: string };

/** Synonymes de la recherche matériaux : chaque groupe réunit des termes équivalents. */
export function SynonymesMateriaux() {
  const q = useQuery({
    queryKey: ["materiaux-synonymes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("materiaux_synonymes").select("id,groupe,terme").order("groupe").order("terme");
      if (error) throw error;
      return (data ?? []) as Syn[];
    },
  });
  const [groupe, setGroupe] = useState("");
  const [terme, setTerme] = useState("");
  const groupes = [...new Set((q.data ?? []).map((s) => s.groupe))];

  const ajouter = async (g: string, t: string) => {
    if (!g.trim() || !t.trim()) return;
    const { error } = await supabase.from("materiaux_synonymes").insert({ groupe: g.trim(), terme: t.trim() });
    if (error) return toast.error(error.message.includes("duplicate") ? "Ce terme existe déjà" : error.message);
    setTerme(""); void q.refetch();
  };
  const retirer = async (id: string) => {
    const { error } = await supabase.from("materiaux_synonymes").delete().eq("id", id);
    if (error) toast.error(error.message); else void q.refetch();
  };

  return (
    <div className="space-y-3 text-sm">
      {groupes.map((g) => (
        <div key={g} className="flex flex-wrap items-center gap-1">
          <span className="w-40 shrink-0 font-medium">{g}</span>
          {(q.data ?? []).filter((s) => s.groupe === g).map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1">
              {s.terme}
              <button type="button" aria-label={`Retirer ${s.terme}`} onClick={() => void retirer(s.id)}><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Input className="w-48" list="syn-groupes" placeholder="Groupe (ex. diffusant)" value={groupe} onChange={(e) => setGroupe(e.target.value)} />
        <datalist id="syn-groupes">{groupes.map((g) => <option key={g} value={g} />)}</datalist>
        <Input className="w-48" placeholder="Terme équivalent" value={terme} onChange={(e) => setTerme(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void ajouter(groupe, terme)} />
        <Button variant="outline" onClick={() => void ajouter(groupe, terme)}>Ajouter</Button>
      </div>
    </div>
  );
}
