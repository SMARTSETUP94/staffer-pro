import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ETAPE_CLASSES, ETAPE_LABELS } from "@/lib/logistique/etapes";
import { ajouterJours } from "@/lib/dispos";
import { blocsExport, ENTETE_BLOC, horaire } from "@/lib/imports/planning-equipes";
import { semaineParPersonne } from "@/lib/logistique/planning-semaine";
import { titreJour } from "@/components/logistique/PlanningEquipes";

export const Route = createFileRoute("/planning-equipes")({
  validateSearch: (s: Record<string, unknown>) => ({ cle: typeof s.cle === "string" ? s.cle : undefined }),
  head: () => ({
    meta: [
      { title: "Planning des équipes — Setup Paris" },
      { name: "description", content: "Planning logistique des équipes Setup Paris, semaine en cours et suivante." },
      { property: "og:title", content: "Planning des équipes — Setup Paris" },
      { property: "og:description", content: "Interventions et affectations des équipes, jour par jour et par personne." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PlanningPublic,
});

const L = ETAPE_LABELS as Record<string, string>;
const C = ETAPE_CLASSES as Record<string, string>;
const weekend = (iso: string) => { const j = new Date(`${iso}T12:00:00Z`).getUTCDay(); return j === 0 || j === 6; };
const dateCourte = (iso: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
type Donnees = { debut: string; genere_le: string; etapes: any[]; affectations: any[]; personnes: any[] };

function PlanningPublic() {
  const { cle } = Route.useSearch();
  const [semaine, setSemaine] = useState<0 | 1>(0);
  const [vue, setVue] = useState<"jours" | "employes">("jours");
  const q = useQuery({
    queryKey: ["planning-public", cle, semaine], enabled: !!cle, retry: false,
    refetchInterval: 60_000, refetchOnWindowFocus: true,
    queryFn: async () => { const { data, error } = await supabase.rpc("planning_public_lire", { _cle: cle!, _semaine: semaine }); if (error) throw error; return data as unknown as Donnees; },
  });
  if (!cle || q.error) return <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">Ce lien n'est pas valide ou a été désactivé. Demandez le nouveau lien à la logistique.</p>;
  const debut = q.data?.debut ?? "";
  const dates = debut ? Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i)) : [];
  const etapes = q.data?.etapes ?? [];
  const affectations = q.data?.affectations ?? [];
  const personnes = q.data?.personnes ?? [];
  const blocs = blocsExport(dates, etapes, affectations, personnes);
  const lignes = semaineParPersonne(dates, etapes, affectations, personnes);
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", o).format(new Date(`${iso}T12:00:00`));
  const titre = dates.length ? `Planning du ${fmt(dates[0], { day: "numeric", month: "long" })} au ${fmt(dates[6], { day: "numeric", month: "long", year: "numeric" })}` : "Planning des équipes";
  const maj = q.data ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(q.data.genere_le)) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant={semaine === 0 ? "default" : "outline"} onClick={() => setSemaine(0)}>Cette semaine</Button>
          <Button size="sm" variant={semaine === 1 ? "default" : "outline"} onClick={() => setSemaine(1)}>Semaine suivante</Button>
        </div>
        <div className="flex items-center gap-1" role="tablist">
          <Button size="sm" variant={vue === "jours" ? "default" : "outline"} onClick={() => setVue("jours")}>Jour par jour</Button>
          <Button size="sm" variant={vue === "employes" ? "default" : "outline"} onClick={() => setVue("employes")}>Par employé</Button>
        </div>
        {maj && <span className="text-xs text-muted-foreground">Mis à jour à {maj}</span>}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-xl font-bold">{titre}{vue === "employes" ? " — par employé" : ""}</h1><div className="flex flex-wrap gap-1">{Object.keys(C).map(t => <span key={t} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${C[t]}`}>{L[t]}</span>)}</div></div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Chargement…</p> : q.error ? <p className="text-sm text-destructive">Lecture du planning impossible.</p> : vue === "jours" ? (
        <div className="space-y-6">
          {dates.map((jour, i) => {
            const duJour = blocs.filter(b => b.jour === jour);
            if (!duJour.length) return null;
            return (
              <section key={jour} className={i > 0 ? "space-y-3" : "space-y-3"}>
                <h2 className="rounded-md bg-primary px-3 py-1.5 text-center text-lg font-bold capitalize text-primary-foreground">{titreJour(jour)} <span className="text-sm font-medium opacity-80">· {duJour.length} intervention{duJour.length > 1 ? "s" : ""} · {duJour.reduce((n, b) => n + b.personnes.length, 0)} pers.</span></h2>
                {duJour.map(b => (
                  <table key={b.etape.id} className="w-full break-inside-avoid border-collapse overflow-hidden rounded-md text-sm shadow-sm">
                    <thead><tr>{ENTETE_BLOC.map(h => h === "Commentaires" ? "Véhicule" : h).map(h => <th key={h} className="border border-border bg-muted px-2 py-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{h}</th>)}</tr></thead>
                    <tbody>
                      <tr className="bg-card font-semibold">
                        <td className={`border border-border px-2 py-1 text-base font-bold tabular-nums ${C[b.etape.type] ?? "bg-muted"}`}>{b.etape.numero}</td>
                        <td className="border border-border px-2 py-1 text-base">{b.etape.nom}</td>
                        <td className="border border-border px-2 py-1">{b.etape.responsable ?? ""}</td>
                        <td className="border border-border px-2 py-1"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${C[b.etape.type] ?? "bg-muted"}`}>{L[b.etape.type] ?? b.etape.type}</span></td>
                        <td className="border border-border px-2 py-1 font-normal">{b.etape.lieu ?? ""}</td>
                        <td className="border border-border px-2 py-1 font-normal text-muted-foreground">{b.etape.vehicule ?? ""}</td>
                      </tr>
                      {b.personnes.length === 0 ? (
                        <tr><td colSpan={6} className="border border-border bg-destructive/10 px-2 py-1 font-medium italic text-destructive">Équipe à compléter</td></tr>
                      ) : Array.from({ length: Math.ceil(b.personnes.length / 6) }, (_, r) => (
                        <tr key={r}>{Array.from({ length: 6 }, (_, c) => <td key={c} className={`border border-border px-2 py-1 ${b.personnes[r * 6 + c]?.role === "chef_equipe" ? "bg-accent font-semibold text-accent-foreground" : "bg-muted/30"}`}>{b.personnes[r * 6 + c]?.nom ?? ""}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </section>
            );
          })}
          {!blocs.length && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune étape cette semaine.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] table-fixed border-collapse text-xs">
            <thead><tr>
              <th className="sticky left-0 w-36 border border-border bg-primary px-2 py-1.5 text-left text-primary-foreground">Nom Prénom</th>
              {dates.map(d => <th key={d} className={`border border-border px-2 py-1.5 text-left capitalize ${weekend(d) ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"}`}>{dateCourte(d)}</th>)}
            </tr></thead>
            <tbody>
              {lignes.map((l, n) => (
                <tr key={`${l.personne.origine}:${l.personne.id}`} className={`break-inside-avoid align-top ${n % 2 ? "bg-muted/40" : "bg-card"}`}>
                  <td className="sticky left-0 border border-border bg-inherit px-2 py-1 whitespace-nowrap"><div className="font-semibold">{l.personne.nom.toLocaleUpperCase("fr")} {l.personne.prenom}</div><div className="text-[10px] text-muted-foreground">{l.jours.filter(j => j.length).length} j travaillé{l.jours.filter(j => j.length).length > 1 ? "s" : ""}</div></td>
                  {l.jours.map((cases, i) => (
                    <td key={i} className={`border border-border p-1 ${weekend(dates[i]) ? "bg-muted/60" : ""}`}>
                      {cases.map(c => (
                        <div key={c.etape.id} className={`mb-1 rounded px-1.5 py-1 last:mb-0 ${C[c.etape.type] ?? "bg-muted"}`}>
                          <div className="flex items-center justify-between gap-1 text-[10px] font-semibold uppercase opacity-90"><span>{L[c.etape.type] ?? c.etape.type}</span>{horaire(c.etape) && <span className="tabular-nums">{horaire(c.etape)}</span>}</div>
                          <div className="font-semibold leading-tight"><span className="tabular-nums">{c.etape.numero}</span> {c.etape.nom}{c.chef ? " ★ chef" : ""}</div>
                          {c.etape.lieu && <div className="truncate text-[10px] opacity-90">{c.etape.lieu}</div>}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!lignes.length && <p className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucun employé affecté cette semaine.</p>}
        </div>
      )}
    </div>
  );
}
