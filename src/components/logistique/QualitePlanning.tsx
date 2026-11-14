import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { indicateurQualite, type EtapeQualite, type FeedbackQualite } from "@/lib/logistique/qualite-planning";

/** Indicateur qualité : étapes des 14 prochains jours et corrections IA des 30 derniers jours. */
export function QualitePlanning() {
  const [q, setQ] = useState<ReturnType<typeof indicateurQualite> | null>(null);
  useEffect(() => {
    const auj = format(new Date(), "yyyy-MM-dd");
    void Promise.all([
      supabase.from("affaire_etapes_logistiques").select("type,heure_debut,lieu_id,lieu_libre,vehicule_id,responsable,source_type,statut")
        .gte("date_debut", auj).lte("date_debut", format(addDays(new Date(), 14), "yyyy-MM-dd")).limit(1000),
      supabase.from("ia_feedback_logistique").select("propose,retenu").gte("created_at", addDays(new Date(), -30).toISOString()).limit(500),
    ]).then(([e, f]) => setQ(indicateurQualite((e.data ?? []) as EtapeQualite[], (f.data ?? []) as FeedbackQualite[])));
  }, []);
  if (!q) return null;
  const cases: [string, number | null, string][] = [
    ["Heure", q.heure, "étapes avec heure de début"], ["Lieu connu", q.lieu_connu, `lieu rattaché à un lieu enregistré (renseigné : ${q.lieu_renseigne ?? "—"} %)`],
    ["Véhicule", q.vehicule, "transports avec véhicule affecté"], ["Responsable", q.responsable, "étapes avec responsable"],
    ["Source", q.source, "étapes reliées à leur mail ou jalonnement"], ["IA gardée", q.ia_gardees, `propositions IA gardées (${q.corrections} validations sur 30 jours)`],
    ["Heures IA", q.ia_heures, "heures proposées justes"],
  ];
  return (
    <section aria-label="Qualité du planning" className="rounded-md border bg-muted/30 p-2">
      <p className="mb-1 text-xs text-muted-foreground">Qualité — {q.etapes} étape(s) dans les 14 prochains jours</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        {cases.map(([t, v, aide]) => (
          <div key={t} title={aide} className="rounded border bg-background px-2 py-1">
            <p className="text-[11px] text-muted-foreground">{t}</p>
            <p className={`text-sm font-semibold ${v == null ? "text-muted-foreground" : v < 50 ? "text-destructive" : v < 80 ? "text-warning" : "text-success"}`}>{v == null ? "—" : `${v} %`}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
