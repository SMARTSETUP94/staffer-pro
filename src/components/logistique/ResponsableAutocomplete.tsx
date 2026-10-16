import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { roleLabel } from "@/lib/labels";

const ROLES = ["chef_chantier", "chef_pose", "logistique", "commercial", "admin"] as const;

/** Champ libre avec suggestions : chefs d'équipe et utilisateurs encadrants de l'application. */
export function ResponsableAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data = [] } = useQuery({
    queryKey: ["responsables-logistique"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("role", ROLES as never);
      const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const order = (r: string) => ROLES.indexOf(r as never);
      return (profs ?? []).filter((p) => p.full_name || p.email).map((p) => {
        const rs = (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string).sort((a, b) => order(a) - order(b));
        return { name: (p.full_name || p.email) as string, role: rs[0] ?? "", rank: order(rs[0] ?? "") };
      }).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    },
  });
  return (
    <>
      <Input list="responsables-logistique" placeholder="Rechercher un chef d'équipe ou saisir un nom"
        value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id="responsables-logistique">
        {data.map((p) => <option key={p.name} value={p.name}>{p.role ? roleLabel(p.role as never) : ""}</option>)}
      </datalist>
    </>
  );
}
