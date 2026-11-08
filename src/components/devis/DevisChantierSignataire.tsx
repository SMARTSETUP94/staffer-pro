import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DevisClient } from "@/lib/devis/pdf-client";

export function DevisChantierSignataire({ devisId, disabled, enregistrer }: { devisId: string; disabled: boolean; enregistrer: (patch: Record<string, unknown>) => Promise<unknown> }) {
  const q = useQuery({ queryKey: ["devis-champs-client", devisId], queryFn: async () => {
    const { data, error } = await supabase.rpc("devis_lire_client", { _devis_id: devisId });
    if (error) throw error;
    return data as unknown as DevisClient;
  } });
  if (!q.data) return null;
  const vc = q.data;
  const champs = [
    { key: "chantier_adresse", label: "Adresse du chantier", value: vc.chantier?.adresse, type: "text" },
    { key: "travaux_libelle", label: "Travaux", value: vc.chantier?.travaux, type: "text" },
    { key: "travaux_debut", label: "Début des travaux", value: vc.chantier?.debut, type: "date" },
    { key: "travaux_duree_jours", label: "Durée (jours)", value: vc.chantier?.duree_jours, type: "number" },
  ];
  return <details className="border-b pb-3"><summary className="cursor-pointer text-sm font-medium">Chantier et signataire du devis</summary>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{champs.map((c) => <div key={c.key} className="space-y-1"><Label htmlFor={c.key}>{c.label}</Label>
      <Input id={c.key} type={c.type} defaultValue={c.value ?? ""} disabled={disabled} onBlur={async (e) => {
        if (e.target.value === String(c.value ?? "")) return;
        await enregistrer({ [c.key]: e.target.value || null }); await q.refetch();
      }} /></div>)}</div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      ["signataire_prenom", "Prénom du signataire"], ["signataire_nom", "Nom du signataire"], ["signataire_email", "Email du signataire"], ["signataire_telephone", "Téléphone du signataire"],
    ].map(([key, label]) => <ChampSignataire key={key} devisId={devisId} champ={key} label={label} disabled={disabled} enregistrer={enregistrer} />)}</div>
  </details>;
}

function ChampSignataire({ devisId, champ, label, disabled, enregistrer }: { devisId: string; champ: string; label: string; disabled: boolean; enregistrer: (p: Record<string, unknown>) => Promise<unknown> }) {
  const q = useQuery({ queryKey: ["devis-signataire", devisId], queryFn: async () => {
    const { data, error } = await supabase.from("devis").select("signataire_prenom,signataire_nom,signataire_email,signataire_telephone").eq("id", devisId).single();
    if (error) throw error; return data;
  } });
  const value = q.data ? (q.data as Record<string, string | null>)[champ] ?? "" : "";
  return <div className="space-y-1"><Label htmlFor={champ}>{label}</Label><Input key={value} id={champ} type={champ.endsWith("email") ? "email" : "text"} defaultValue={value} disabled={disabled || !q.data} onBlur={async (e) => {
    if (e.target.value === value) return;
    await enregistrer({ [champ]: e.target.value || null }); await q.refetch();
  }} /></div>;
}