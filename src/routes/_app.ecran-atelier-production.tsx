import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Maximize, Truck } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { lirePlanningSimple } from "@/lib/planning-simple.functions";
import { addDays } from "@/lib/staffing/date-utils";

export const Route = createFileRoute("/_app/ecran-atelier-production")({
  beforeLoad: () => requireCapability("section.affaires"),
  head: () => ({
    meta: [
      { title: "Écran atelier — Planning production Setup Paris" },
      { name: "description", content: "Affichage grand écran des chantiers en fabrication à l'atelier." },
      { property: "og:title", content: "Écran atelier — Planning production" },
      { property: "og:description", content: "Chantiers en cours et à venir à l'atelier, par métier." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EcranProduction,
});

const METIERS_ATELIER = [1, 2, 3, 4, 5, 6, 8, 9];
const HORIZON = 14;
const fmt = (d: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00`));

/** Écran atelier production : lecture seule, sans montants ni noms, actualisé toutes les 2 min. */
function EcranProduction() {
  const lire = useServerFn(lirePlanningSimple);
  const q = useQuery({ queryKey: ["planning-simple"], queryFn: () => lire(), refetchInterval: 120_000 });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const jour = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(now);
  const limite = addDays(jour, HORIZON);

  const { enCours, aVenir } = useMemo(() => {
    const d = q.data;
    if (!d) return { enCours: [], aVenir: [] };
    const cartes = d.affaires.flatMap((a) => {
      const per = d.periodes.filter((p) => p.affaire_id === a.id && METIERS_ATELIER.includes(p.metier_id));
      const debut = a.atelier_date_debut ?? per.map((p) => p.date_debut).sort()[0];
      const fin = a.atelier_date_fin ?? per.map((p) => p.date_fin).sort().at(-1);
      if (!debut || !fin || fin < jour || debut > limite) return [];
      const metiers = per.map((p) => ({
        nom: d.metiers.find((m) => m.id === p.metier_id)?.libelle ?? "",
        actif: p.date_debut <= jour && p.date_fin >= jour, debut: p.date_debut, fin: p.date_fin,
      })).sort((x, y) => x.debut.localeCompare(y.debut));
      const depart = d.etapes.find((e) => e.affaire_id === a.id && e.date_debut >= jour)?.date_debut ?? null;
      return [{ id: a.id, numero: a.numero, nom: a.nom, debut, fin, metiers, depart, previsionnel: a.phase !== "signe" }];
    }).sort((x, y) => (x.depart ?? x.fin).localeCompare(y.depart ?? y.fin));
    return { enCours: cartes.filter((c) => c.debut <= jour), aVenir: cartes.filter((c) => c.debut > jour) };
  }, [q.data, jour, limite]);

  const titre = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(now);
  const plein = () => document.documentElement.requestFullscreen?.().catch(() => {});
  const Carte = ({ c, grand }: { c: (typeof enCours)[number]; grand: boolean }) => (
    <article className={`rounded-xl border bg-card p-4 ${c.previsionnel ? "border-dashed border-muted-foreground" : "border-border"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={`font-bold ${grand ? "text-2xl" : "text-xl"}`}><span className="tabular-nums text-primary">{c.numero}</span> {c.nom}</h3>
        <span className="text-lg text-muted-foreground">{fmt(c.debut)} → {fmt(c.fin)}</span>
      </div>
      {c.depart && <p className="mt-1 flex items-center gap-2 text-lg font-semibold"><Truck className="size-5" />Départ {fmt(c.depart)}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {c.metiers.length === 0 ? <span className="text-lg text-muted-foreground">Métiers à préciser</span> : c.metiers.map((m) => (
          <span key={m.nom} className={`rounded-md px-3 py-1 text-lg ${m.actif ? "bg-primary font-bold text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {m.nom}{!m.actif && ` · ${fmt(m.debut)}`}
          </span>))}
      </div>
    </article>
  );

  return (
    <div className="min-h-screen space-y-6 bg-background p-6 text-foreground">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/planning-atelier" aria-label="Retour" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-6 w-6" /></Link>
          <h1 className="text-4xl font-bold">Planning atelier</h1>
          <button onClick={plein} aria-label="Plein écran" className="text-muted-foreground hover:text-foreground"><Maximize className="h-6 w-6" /></button>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold tabular-nums">{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(now)}</div>
          <div className="text-lg text-muted-foreground first-letter:uppercase">{titre}</div>
        </div>
      </div>
      {q.error && <p role="alert" className="text-lg text-destructive">Planning indisponible pour ce compte.</p>}
      <section className="space-y-3">
        <h2 className="text-3xl font-bold">En fabrication ({enCours.length})</h2>
        {enCours.length === 0 ? <p className="text-lg text-muted-foreground">Aucun chantier en cours à l’atelier.</p>
          : <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{enCours.map((c) => <Carte key={c.id} c={c} grand />)}</div>}
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">À venir sous 2 semaines ({aVenir.length})</h2>
        {aVenir.length === 0 ? <p className="text-lg text-muted-foreground">Rien de prévu.</p>
          : <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{aVenir.map((c) => <Carte key={c.id} c={c} grand={false} />)}</div>}
      </section>
      <p className="text-sm text-muted-foreground">Bordure pointillée : chantier prévisionnel. Actualisation automatique toutes les 2 minutes.</p>
    </div>
  );
}
