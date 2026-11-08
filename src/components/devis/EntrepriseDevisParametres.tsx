import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";
import { LogoEntrepriseUpload } from "./LogoEntrepriseUpload";

type Entreprise = Database["public"]["Tables"]["parametres_entreprise"]["Row"];
const champs = [
  ["raison_sociale", "Raison sociale"], ["forme_sociale", "Forme sociale"], ["capital_social_euros", "Capital (€)"],
  ["adresse_ligne1", "Adresse"], ["code_postal", "Code postal"], ["ville", "Ville"], ["naf", "APE"], ["siret", "SIRET"],
  ["tva_intracom", "TVA intracommunautaire"], ["telephone", "Téléphone"], ["employeur_email_contact", "Email"], ["iban", "IBAN"], ["bic", "BIC"],
  ["mode_reglement", "Mode de règlement"], ["acompte_pct", "Acompte (%)"], ["delai_reglement_jours", "Délai (jours)"],
] as const;
export function EntrepriseDevisParametres() {
  const { roles } = useAuth(); const admin = roles.includes("admin");
  const q = useQuery({ queryKey: ["entreprise-devis"], enabled: admin, queryFn: async () => {
    const { data, error } = await supabase.from("parametres_entreprise").select("*").eq("singleton", true).single();
    if (error) throw error; return data;
  } });
  if (!admin) return null;
  if (q.error) return <p className="text-sm text-destructive">Paramètres entreprise réservés à l’administrateur.</p>;
  return <section className="space-y-3 border-t pt-5"><h2 className="text-lg font-semibold">Entreprise — documents client</h2>{q.data && <Formulaire key={q.data.updated_at} entreprise={q.data} refresh={() => q.refetch()} />}</section>;
}
function Formulaire({ entreprise, refresh }: { entreprise: Entreprise; refresh: () => Promise<unknown> }) {
  const [patch, setPatch] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const value = (k: keyof Entreprise) => patch[k] ?? String(entreprise[k] ?? "");
  const save = async () => {
    setBusy(true);
    const converted: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(patch)) converted[k] = !v.trim() ? null : ["capital_social_euros", "acompte_pct", "delai_reglement_jours"].includes(k) ? Number(v) : v.trim();
    const update = converted as Database["public"]["Tables"]["parametres_entreprise"]["Update"];
    const { error } = await supabase.from("parametres_entreprise").update(update).eq("id", entreprise.id);
    setBusy(false); if (error) { toast.error("Enregistrement impossible : " + error.message); return; }
    toast.success("Paramètres entreprise enregistrés"); await refresh();
  };
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{champs.map(([key, label]) => <div key={key} className="space-y-1"><Label htmlFor={`entreprise-${key}`}>{label}</Label><Input id={`entreprise-${key}`} value={value(key)} autoComplete="off" onChange={(e) => setPatch((p) => ({ ...p, [key]: e.target.value }))} /></div>)}</div>
    <LogoEntrepriseUpload entrepriseId={entreprise.id} path={entreprise.logo_storage_path} refresh={refresh} />
    {([["mentions_devis", "Mentions du devis"], ["cgv_devis", "Conditions générales de vente"]] as const).map(([key, label]) => <div key={key} className="space-y-1"><Label htmlFor={`entreprise-${key}`}>{label}</Label><Textarea id={`entreprise-${key}`} rows={key === "cgv_devis" ? 8 : 4} value={value(key)} onChange={(e) => setPatch((p) => ({ ...p, [key]: e.target.value }))} /></div>)}
    <Button disabled={busy || !Object.keys(patch).length} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />Enregistrer l’entreprise</Button>
  </div>;
}