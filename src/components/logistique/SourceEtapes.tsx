import { useEffect, useState } from "react";
import { AlertTriangle, Copy, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { avertissementHoraire, rapprocherResponsable, type ChoixDoublon, type Doublon, type EmployeActif } from "@/lib/logistique/source-etapes";

export function useEmployesActifs(): EmployeActif[] {
  const [e, setE] = useState<EmployeActif[]>([]);
  useEffect(() => { void supabase.from("employes").select("id,prenom,nom").eq("actif", true).limit(1000).then(({ data }) => setE((data ?? []) as EmployeActif[])); }, []);
  return e;
}

/** Doublons probables par ligne, recalculés quand le chantier ou les dates/types/heures changent. */
export function useDoublons(affaireId: string, items: { type: string; date_debut: string; heure_debut?: string | null }[]): Doublon[] {
  const [d, setD] = useState<Doublon[]>([]);
  const cle = JSON.stringify([affaireId, items.map((i) => [i.type, i.date_debut, i.heure_debut ?? ""])]);
  useEffect(() => {
    if (!affaireId || !items.length) { setD([]); return; }
    const t = setTimeout(() => {
      void supabase.rpc("logistique_etapes_doublons", { _affaire_id: affaireId, _etapes: items.map((i) => ({ type: i.type, date_debut: i.date_debut, heure_debut: i.heure_debut || null })) })
        .then(({ data, error }) => setD(error ? [] : ((data ?? []) as unknown as Doublon[])));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return d;
}

const LIB: Record<ChoixDoublon, string> = { fusionner: "Fusionner", ignorer: "Ignorer", creer: "Créer quand même" };

export function DoublonChoix({ doublons, choix, onChoix }: { doublons: Doublon[]; choix: ChoixDoublon; onChoix: (c: ChoixDoublon) => void }) {
  if (!doublons.length) return null;
  const d = doublons[0];
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-xs">
      <Copy className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">Déjà au planning : {d.date_debut}{d.heure_debut ? ` ${d.heure_debut.slice(0, 5)}` : ""}{d.lieu_libre ? ` · ${d.lieu_libre}` : ""}{doublons.length > 1 ? ` (+${doublons.length - 1})` : ""}</span>
      {(Object.keys(LIB) as ChoixDoublon[]).map((c) => (
        <Button key={c} type="button" size="sm" variant={choix === c ? "default" : "outline"} className="h-6 px-2 text-[11px]" onClick={() => onChoix(c)}>{LIB[c]}</Button>
      ))}
    </div>
  );
}

export function HoraireAvertissement({ debut, fin }: { debut?: string | null; fin?: string | null }) {
  const a = avertissementHoraire(debut, fin);
  if (!a) return null;
  return <p className={`flex items-center gap-1 text-[11px] ${a.niveau === "refus" ? "text-destructive" : a.niveau === "alerte" ? "text-warning" : "text-muted-foreground"}`}><AlertTriangle className="h-3 w-3" />{a.texte}</p>;
}

export function ResponsableRapproche({ texte, employes }: { texte?: string | null; employes: EmployeActif[] }) {
  if (!(texte ?? "").trim()) return null;
  const r = rapprocherResponsable(texte, employes);
  return r
    ? <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><UserCheck className="h-3 w-3" />{r.nom}</span>
    : <span className="text-[11px] text-muted-foreground">Non reconnu parmi les employés actifs</span>;
}
