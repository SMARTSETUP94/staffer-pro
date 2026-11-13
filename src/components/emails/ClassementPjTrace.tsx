import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { classerPiecesJointesDemande } from "@/lib/server-fns/classement-pj.functions";
import { libelleResultat, type BilanClassement } from "@/lib/pieces-jointes-classement";

const ETAT: Record<string, string> = { classe: "pièces jointes classées", partiel: "classement partiel", a_reprendre: "classement à reprendre", echec: "classement en échec" };

/** Lance le classement automatique sans bloquer le rattachement ; un échec reste visible dans la trace de la demande. */
export async function lancerClassementPj(emailId: string) {
  try {
    const r = await classerPiecesJointesDemande({ data: { emailId } });
    const n = r.bilan.pieces.filter((p) => p.resultat === "classee").length;
    if (n > 0) toast.success(`${n} pièce${n > 1 ? "s" : ""} jointe${n > 1 ? "s" : ""} classée${n > 1 ? "s" : ""} dans l'affaire ${r.numero ?? ""}`.trim());
    else if (r.bilan.etat === "a_reprendre") toast.warning("Pièces jointes : Microsoft ne répond pas, nouvel essai automatique plus tard");
  } catch (e) {
    toast.error("Pièces jointes non classées", { description: (e as Error).message });
  }
}

export function ClassementPjTrace({ emailId }: { emailId: string }) {
  const [row, setRow] = useState<{ opportunite_id: string | null; classement_pj: BilanClassement | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const charger = async () => {
    const { data } = await supabase.from("emails_entrants").select("opportunite_id,classement_pj").eq("id", emailId).maybeSingle();
    setRow((data as any) ?? null);
  };
  useEffect(() => { void charger(); }, [emailId]);
  if (!row?.opportunite_id) return null;
  const b = row.classement_pj;
  return (
    <div className="rounded-md border p-3 text-sm space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{b ? `Documents de l'affaire : ${ETAT[b.etat] ?? b.etat}` : "Pièces jointes pas encore classées dans l'affaire"}</span>
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); await lancerClassementPj(emailId); await charger(); setBusy(false); }}>
          {busy ? "Classement…" : b ? "Relancer le classement" : "Classer les pièces jointes"}
        </Button>
      </div>
      {b && b.pieces.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {b.pieces.map((p) => <li key={p.attachment_id}><span className="text-foreground">{p.nom}</span> — {libelleResultat(p)}</li>)}
        </ul>
      )}
      {b?.pieces.some((p) => p.resultat === "ecartee_logo") && <p className="text-xs text-muted-foreground">Une image écartée peut être classée à la main : bouton « Classer » sur la pièce jointe ci-dessous.</p>}
    </div>
  );
}
