import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, KeyRound, MapPin, MessageSquare, Printer, Truck, User, Users } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { Button } from "@/components/ui/button";
import { ETAPE_CLASSES, ETAPE_LABELS, etapeCouvreJour, heureCourte, joursIso, type EtapeType } from "@/lib/logistique/etapes";
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
  return d ?? f ?? e.horaire_libre ?? null;
}

function Info({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{children}</span>;
}

function EtapeLigne({ e, jour }: { e: EtapeLogistique; jour: string }) {
  const t = e.type as EtapeType;
  const multi = e.date_fin && e.date_fin !== e.date_debut;
  const h = horaire(e);
  const lieu = e.lieu_libre ?? e.affaire?.lieu;
  const vehicule = e.vehicule?.nom ?? e.immatriculation_libre;
  const infos = [e.note, e.commentaire_equipe].filter(Boolean);
  return (
    <div className="break-inside-avoid grid grid-cols-[7.5rem_1fr] gap-3 border-t border-border py-2 first:border-t-0">
      <div className="space-y-1">
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ETAPE_CLASSES[t] ?? "bg-muted"}`}>
          {ETAPE_LABELS[t] ?? e.type}{e.sens ? ` · ${e.sens}` : ""}
        </span>
        <div className="text-sm font-semibold tabular-nums">{h ?? <span className="font-normal text-muted-foreground">Horaire à définir</span>}</div>
        {multi && <div className="text-xs text-muted-foreground">Jusqu'au {format(parseISO(e.date_fin!), "d MMM", { locale: fr })}{jour !== e.date_debut ? " (suite)" : ""}</div>}
      </div>
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-semibold">
          <span className="tabular-nums">{e.affaire?.numero}</span> — {e.affaire?.nom}
          {e.affaire?.client && <span className="font-normal text-muted-foreground"> · {e.affaire.client}</span>}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {lieu && <Info icon={MapPin}>{lieu}</Info>}
          {e.responsable && <Info icon={User}>{e.responsable}</Info>}
          {e.nb_personnes ? <Info icon={Users}><b>{e.nb_personnes}p</b></Info> : null}
          {vehicule && <Info icon={Truck}>{vehicule}{e.nb_vehicules && e.nb_vehicules > 1 ? ` ×${e.nb_vehicules}` : ""}</Info>}
          {e.acces && <Info icon={KeyRound}>{e.acces}</Info>}
        </div>
        {infos.length > 0 && <div className="flex gap-1 text-xs text-muted-foreground"><MessageSquare className="mt-0.5 h-3 w-3 shrink-0" /><span className="whitespace-pre-line">{infos.join(" · ")}</span></div>}
      </div>
    </div>
  );
}

function ImprimerSemaine() {
  const [start, setStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [masquerVides, setMasquerVides] = useState(true);
  const jours = useMemo(() => joursIso(start, 7), [start]);
  const { data: etapes = [], isLoading } = useEtapesLogistiques(jours[0], jours[6]);
  const fin = addDays(start, 6);
  const parJour = useMemo(() => jours.map((j) => ({
    j,
    list: etapes.filter((e) => etapeCouvreJour(e, j))
      .sort((a, b) => (a.heure_debut ?? "99").localeCompare(b.heure_debut ?? "99")),
  })), [jours, etapes]);
  const totalPers = etapes.reduce((s, e) => s + (e.nb_personnes ?? 0), 0);
  const nbChantiers = new Set(etapes.map((e) => e.affaire_id)).size;
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="planning-print mx-auto max-w-5xl space-y-4 p-4 sm:p-6 print:max-w-none print:space-y-3 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2 print:hidden">
        <Button variant="ghost" size="sm" asChild><Link to="/logistique"><ArrowLeft className="mr-1 h-4 w-4" />Planning</Link></Button>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Semaine précédente" onClick={() => setStart(addDays(start, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Cette semaine</Button>
          <Button variant="outline" size="icon" aria-label="Semaine suivante" onClick={() => setStart(addDays(start, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={masquerVides} onChange={(e) => setMasquerVides(e.target.checked)} />Masquer les jours vides</label>
          <Button onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Imprimer / PDF</Button>
        </div>
      </div>

      <header className="flex items-end justify-between gap-4 border-b-2 border-foreground pb-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Setup Paris · Planning logistique</div>
          <h1 className="text-2xl font-bold">Semaine du {format(start, "d", { locale: fr })} au {format(fin, "d MMMM yyyy", { locale: fr })}</h1>
        </div>
        <div className="flex gap-4 text-right text-sm">
          <div><div className="text-lg font-bold tabular-nums">{etapes.length}</div><div className="text-xs text-muted-foreground">étapes</div></div>
          <div><div className="text-lg font-bold tabular-nums">{nbChantiers}</div><div className="text-xs text-muted-foreground">chantiers</div></div>
          <div><div className="text-lg font-bold tabular-nums">{totalPers}p</div><div className="text-xs text-muted-foreground">effectif cumulé</div></div>
        </div>
      </header>

      {isLoading ? <p className="text-sm text-muted-foreground">Chargement…</p> : (
        <div className="space-y-3">
          {parJour.map(({ j, list }) => {
            if (list.length === 0 && masquerVides) return null;
            const pers = list.reduce((s, e) => s + (e.nb_personnes ?? 0), 0);
            return (
              <section key={j} className="break-inside-avoid-page overflow-hidden rounded-lg border border-border">
                <h2 className={`flex items-center justify-between px-3 py-1.5 text-sm font-bold capitalize ${j === today ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <span>{format(parseISO(j), "EEEE d MMMM", { locale: fr })}</span>
                  <span className="text-xs font-medium normal-case opacity-80">{list.length} étape{list.length > 1 ? "s" : ""}{pers ? ` · ${pers}p` : ""}</span>
                </h2>
                <div className="px-3">
                  {list.length === 0 ? <p className="py-2 text-sm text-muted-foreground">Rien de prévu</p> : list.map((e) => <EtapeLigne key={e.id} e={e} jour={j} />)}
                </div>
              </section>
            );
          })}
          {etapes.length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune étape cette semaine.</p>}
        </div>
      )}
      <footer className="hidden pt-2 text-xs text-muted-foreground print:block">Imprimé le {format(new Date(), "d MMMM yyyy à HH'h'mm", { locale: fr })} — effectifs indicatifs, staffing nominatif à venir.</footer>
    </div>
  );
}
