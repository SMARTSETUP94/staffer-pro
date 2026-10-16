import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { KeyRound, MapPin, Maximize, Truck, User, Users, X } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { ETAPE_CLASSES, ETAPE_LABELS, etapeCouvreJour, heureCourte, joursIso, type EtapeType } from "@/lib/logistique/etapes";
import { useEtapesLogistiques, type EtapeLogistique } from "@/hooks/use-etapes-logistiques";

export const Route = createFileRoute("/_app/logistique/ecran")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({
    meta: [
      { title: "Écran Atelier — Planning logistique Setup Paris" },
      { name: "description", content: "Affichage grand écran du planning logistique pour l'atelier." },
      { property: "og:title", content: "Écran Atelier — Setup Paris" },
      { property: "og:description", content: "Planning logistique en grand format pour la TV de l'atelier." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EcranAtelier,
});

const DAYS = 5;

function horaire(e: EtapeLogistique) {
  const d = heureCourte(e.heure_debut), f = heureCourte(e.heure_fin);
  if (d && f) return `${d}–${f}`;
  return d ?? f ?? e.horaire_libre ?? "—";
}

function Carte({ e, big }: { e: EtapeLogistique; big: boolean }) {
  const t = e.type as EtapeType;
  const lieu = e.lieu_libre ?? e.affaire?.lieu;
  const vehicule = e.vehicule?.nom ?? e.immatriculation_libre;
  return (
    <div className="rounded-xl border border-border bg-card p-[0.8vw] shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-md px-[0.6vw] py-[0.2vw] font-bold ${big ? "text-[1.3vw]" : "text-[0.95vw]"} ${ETAPE_CLASSES[t] ?? "bg-muted"}`}>
          {ETAPE_LABELS[t] ?? e.type}
        </span>
        <span className={`font-bold tabular-nums ${big ? "text-[1.6vw]" : "text-[1.1vw]"}`}>{horaire(e)}</span>
      </div>
      <div className={`mt-[0.4vw] font-bold leading-tight ${big ? "text-[1.6vw]" : "text-[1.1vw]"}`}>
        <span className="tabular-nums text-primary">{e.affaire?.numero}</span> {e.affaire?.nom}
      </div>
      <div className={`mt-[0.3vw] flex flex-wrap gap-x-[1vw] gap-y-[0.2vw] text-muted-foreground ${big ? "text-[1.1vw]" : "text-[0.85vw]"}`}>
        {lieu && <span className="inline-flex items-center gap-1"><MapPin className="h-[1em] w-[1em]" />{lieu}</span>}
        {e.nb_personnes ? <span className="inline-flex items-center gap-1 font-bold text-foreground"><Users className="h-[1em] w-[1em]" />{e.nb_personnes}p</span> : null}
        {vehicule && <span className="inline-flex items-center gap-1 text-foreground"><Truck className="h-[1em] w-[1em]" />{vehicule}</span>}
        {e.responsable && <span className="inline-flex items-center gap-1"><User className="h-[1em] w-[1em]" />{e.responsable}</span>}
        {big && e.acces && <span className="inline-flex items-center gap-1"><KeyRound className="h-[1em] w-[1em]" />{e.acces}</span>}
      </div>
      {big && (e.commentaire_equipe || e.note) && (
        <div className="mt-[0.3vw] line-clamp-2 text-[1vw] italic text-muted-foreground">{[e.note, e.commentaire_equipe].filter(Boolean).join(" · ")}</div>
      )}
    </div>
  );
}

function EcranAtelier() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  const jours = useMemo(() => joursIso(new Date(now.getFullYear(), now.getMonth(), now.getDate()), DAYS), [now.toDateString()]);
  const { data: etapes = [], dataUpdatedAt } = useEtapesLogistiques(jours[0], jours[DAYS - 1], undefined, 120_000);
  const parJour = useMemo(() => jours.map((j) => ({
    j,
    list: etapes.filter((e) => etapeCouvreJour(e, j)).sort((a, b) => (a.heure_debut ?? "99").localeCompare(b.heure_debut ?? "99")),
  })), [jours, etapes]);

  const plein = () => document.documentElement.requestFullscreen?.().catch(() => {});

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background p-[1.2vw] text-foreground">
      <header className="mb-[1vw] flex items-end justify-between">
        <div>
          <div className="text-[1.1vw] font-semibold uppercase tracking-widest text-muted-foreground">Planning logistique · Setup Paris</div>
          <div className="text-[2.6vw] font-bold capitalize leading-none">{format(now, "EEEE d MMMM", { locale: fr })}</div>
        </div>
        <div className="flex items-center gap-[1vw]">
          <div className="text-right">
            <div className="text-[3.2vw] font-bold tabular-nums leading-none">{format(now, "HH:mm")}</div>
            <div className="text-[0.8vw] text-muted-foreground">Mis à jour {dataUpdatedAt ? format(dataUpdatedAt, "HH:mm") : "—"}</div>
          </div>
          <button onClick={plein} className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground" aria-label="Plein écran"><Maximize className="h-5 w-5" /></button>
          <Link to="/logistique" className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground" aria-label="Quitter"><X className="h-5 w-5" /></Link>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[2fr_repeat(4,1fr)] gap-[1vw]">
        {parJour.map(({ j, list }, i) => (
          <section key={j} className={`flex min-h-0 flex-col rounded-2xl p-[0.8vw] ${i === 0 ? "bg-primary/10 ring-2 ring-primary" : "bg-muted/40"}`}>
            <h2 className={`mb-[0.6vw] flex items-baseline justify-between font-bold capitalize ${i === 0 ? "text-[1.8vw]" : "text-[1.3vw]"}`}>
              <span>{i === 0 ? "Aujourd'hui" : i === 1 ? "Demain" : format(parseISO(j), "EEEE d", { locale: fr })}</span>
              <span className="text-[0.9vw] font-semibold text-muted-foreground">{list.length} étape{list.length > 1 ? "s" : ""}</span>
            </h2>
            <div className="flex min-h-0 flex-1 flex-col gap-[0.6vw] overflow-hidden">
              {list.length === 0
                ? <div className="m-auto text-[1.1vw] text-muted-foreground">Rien de prévu</div>
                : list.map((e) => <Carte key={e.id} e={e} big={i === 0} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
