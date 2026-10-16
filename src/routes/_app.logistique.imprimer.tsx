import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { Button } from "@/components/ui/button";
import { ETAPE_LABELS, etapeCouvreJour, heureCourte, joursIso } from "@/lib/logistique/etapes";
import { useEtapesLogistiques, type EtapeLogistique } from "@/hooks/use-etapes-logistiques";

export const Route = createFileRoute("/_app/logistique/imprimer")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({
    meta: [
      { title: "Planning de la semaine — Setup Paris" },
      { name: "description", content: "Planning logistique hebdomadaire imprimable, sans noms du personnel." },
      { property: "og:title", content: "Planning de la semaine — Setup Paris" },
      { property: "og:description", content: "Version imprimable du planning logistique hebdomadaire." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImprimerSemaine,
});

function horaire(e: EtapeLogistique) {
  const d = heureCourte(e.heure_debut), f = heureCourte(e.heure_fin);
  if (d && f) return `${d} – ${f}`;
  return d ?? f ?? e.horaire_libre ?? "";
}

function ImprimerSemaine() {
  const [start, setStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const jours = useMemo(() => joursIso(start, 7), [start]);
  const { data: etapes = [], isLoading } = useEtapesLogistiques(jours[0], jours[6]);
  const fin = addDays(start, 6);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="outline" asChild><Link to="/logistique">← Planning</Link></Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Semaine précédente" onClick={() => setStart(addDays(start, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" aria-label="Semaine suivante" onClick={() => setStart(addDays(start, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <Button onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Imprimer / PDF</Button>
        </div>
      </div>
      <h1 className="text-xl font-bold">
        Planning du {format(start, "d", { locale: fr })} au {format(fin, "d MMMM yyyy", { locale: fr })}
      </h1>
      {isLoading ? <p className="text-sm text-muted-foreground">Chargement…</p> : jours.map((j) => {
        const du = etapes.filter((e) => etapeCouvreJour(e, j));
        if (du.length === 0) return null;
        return (
          <section key={j} className="break-inside-avoid space-y-1">
            <h2 className="border-b border-border pb-1 text-base font-semibold capitalize">
              {format(parseISO(j), "EEEE d MMMM", { locale: fr })}
            </h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">Chantier</th><th className="pr-2">Opération</th><th className="pr-2">Horaire</th>
                  <th className="pr-2">Lieu</th><th className="pr-2">Responsable</th><th className="pr-2">Pers.</th>
                  <th className="pr-2">Véhicule</th><th>Infos</th>
                </tr>
              </thead>
              <tbody>
                {du.map((e) => (
                  <tr key={e.id} className="border-t border-border align-top">
                    <td className="py-1 pr-2 font-medium">{e.affaire?.numero} {e.affaire?.nom}</td>
                    <td className="pr-2">{ETAPE_LABELS[e.type as keyof typeof ETAPE_LABELS] ?? e.type}{e.sens ? ` (${e.sens})` : ""}</td>
                    <td className="whitespace-nowrap pr-2">{horaire(e)}</td>
                    <td className="pr-2">{e.lieu_libre ?? e.affaire?.lieu ?? ""}{e.acces ? <div className="text-xs text-muted-foreground">Accès : {e.acces}</div> : null}</td>
                    <td className="pr-2">{e.responsable ?? ""}</td>
                    <td className="pr-2">{e.nb_personnes ? `${e.nb_personnes}p` : ""}</td>
                    <td className="pr-2">{e.vehicule?.nom ?? e.immatriculation_libre ?? ""}</td>
                    <td className="text-xs">{[e.note, e.commentaire_equipe].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {!isLoading && etapes.length === 0 && <p className="text-sm text-muted-foreground">Aucune étape cette semaine.</p>}
    </div>
  );
}
