import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireCapability } from "@/lib/capability-guard";
import { ETAPE_CLASSES, ETAPE_LABELS, type EtapeType } from "@/lib/logistique/etapes";
import { horaire } from "@/lib/imports/planning-equipes";
import { ajouterJours } from "@/lib/dispos";

export const Route = createFileRoute("/_app/ecran-atelier")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({
    meta: [
      { title: "Écran atelier — Planning logistique" },
      { name: "description", content: "Affichage grand format du planning logistique et des équipes pour l'atelier." },
      { property: "og:title", content: "Écran atelier — Planning logistique" },
      { property: "og:description", content: "Planning logistique d'aujourd'hui et des 6 prochains jours." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EcranAtelier,
});

type EtapeEcran = { id: string; date: string; fin: string; heure: string | null; heure_fin: string | null; type: string; numero: string; nom: string; lieu: string | null; vehicule: string | null; nb_personnes: number | null; equipe: { nom: string; prenom: string; chef: boolean }[] };

/** Écran atelier : lecture seule, sans téléphones ni montants (lecteur dédié côté base). */
function EcranAtelier() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const jour = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(now);
  const dates = Array.from({ length: 7 }, (_, i) => ajouterJours(jour, i));
  const q = useQuery({
    queryKey: ["ecran-atelier", jour], refetchInterval: 120_000,
    queryFn: async () => { const { data, error } = await supabase.rpc("planning_terrain_ecran" as never, { _debut: jour, _fin: dates[6] } as never); if (error) throw error; return (data ?? []) as unknown as EtapeEcran[]; },
  });
  const du = (d: string) => (q.data ?? []).filter((e) => e.date <= d && e.fin >= d).sort((a, b) => (a.heure ?? "99").localeCompare(b.heure ?? "99"));
  const titre = (d: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${d}T12:00:00`));
  return (
    <div className="min-h-screen space-y-4 bg-background p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/logistique" aria-label="Retour" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-6 w-6" /></Link>
          <h1 className="text-4xl font-bold">Planning logistique</h1>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold tabular-nums">{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(now)}</div>
          <div className="text-lg first-letter:uppercase text-muted-foreground">{titre(jour)}</div>
        </div>
      </div>
      {q.error && <p role="alert" className="text-lg text-destructive">Planning indisponible pour ce compte.</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        {dates.map((d, i) => <section key={d} className={`space-y-2 ${i === 0 ? "xl:col-span-2" : ""}`}>
          <h2 className={`font-bold first-letter:uppercase ${i === 0 ? "text-3xl" : "text-2xl"}`}>{i === 0 ? "Aujourd’hui · " : ""}{titre(d)}</h2>
          {du(d).length === 0 ? <p className="text-lg text-muted-foreground">Aucune intervention.</p> : <div className={`grid gap-3 ${i === 0 ? "md:grid-cols-2 2xl:grid-cols-3" : ""}`}>{du(d).map((e) => (
            <article key={e.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className={`flex flex-wrap items-center gap-3 px-4 py-2 ${i === 0 ? "text-2xl" : "text-xl"} ${ETAPE_CLASSES[e.type as EtapeType] ?? "bg-muted"}`}>
                <strong>{e.numero} · {ETAPE_LABELS[e.type as EtapeType] ?? e.type}</strong><span>{horaire(e) || "horaire à confirmer"}</span>
                <span className="ml-auto font-semibold">{e.equipe.length}/{e.nb_personnes ?? "—"}</span>
              </div>
              <div className="space-y-1 px-4 py-3 text-lg">
                <p className="font-semibold">{e.nom}{e.lieu ? ` · ${e.lieu}` : ""}</p>
                {e.vehicule && <p className="flex items-center gap-2"><Truck className="size-5" />{e.vehicule}</p>}
                <p>{e.equipe.length ? e.equipe.map((p) => `${p.prenom} ${p.nom}${p.chef ? " (chef)" : ""}`).join(" · ") : <span className="text-destructive">Équipe à compléter</span>}</p>
              </div>
            </article>))}</div>}
        </section>)}
      </div>
    </div>
  );
}
