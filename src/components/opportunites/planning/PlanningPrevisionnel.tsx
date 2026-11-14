import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronRight as Chevron, Info, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  GROUPES, GROUPE_LABEL, aDater, ajouterJours, calculerPeriodes, datePasseeAClore, ecartJours, estFermeture,
  cleMateriau, etatSignature, fmtJJMM, grouper, lundi, param, regrouperMateriaux,
  type OppPlanning, type Parametres, type StatutOuvert,
} from "@/lib/opportunites/planning-previsionnel";

export interface PlanningData { couts: boolean; parametres: Parametres; opportunites: OppPlanning[] }

const COULEUR: Record<StatutOuvert, { bar: string; text: string }> = {
  presque_gagne: { bar: "bg-su-vert", text: "text-su-vert" },
  a_l_etude: { bar: "bg-su-bleu", text: "text-su-bleu" },
  envoye: { bar: "bg-su-ciel", text: "text-su-ciel" },
  a_faire: { bar: "bg-muted-foreground", text: "text-muted-foreground" },
};
const eur = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const qte = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const texte = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function materiauxFiche(o: OppPlanning) {
  const m = new Map<string, OppPlanning["materiaux"][number] & { achat: number | null }>();
  for (const x of o.materiaux) {
    const k = cleMateriau(x);
    const cur = m.get(k);
    const achat = x.prix_achat == null ? null : x.prix_achat * x.quantite;
    if (!cur) m.set(k, { ...x, achat });
    else { cur.quantite += x.quantite; cur.achat = achat == null ? cur.achat : (cur.achat ?? 0) + achat; }
  }
  return [...m.values()];
}
const TAILLE: Record<string, string> = { tres_petit: "Très petit", petit: "Petit", moyen: "Moyen", gros: "Gros", tres_gros: "Très gros" };

function titre(o: OppPlanning) {
  const n = o.nom ?? "";
  return n.startsWith(`${o.numero}_`) ? n.slice((o.numero ?? "").length + 1) : n;
}

export function PlanningPrevisionnel({ data, aujourdhui }: { data: PlanningData; aujourdhui: string }) {
  const p = data.parametres;
  const [ca, setCa] = useState<string>("tous");
  const [duree, setDuree] = useState<"16" | "26">("16");
  const [decalage, setDecalage] = useState(0);
  const [replies, setReplies] = useState<Record<StatutOuvert, boolean>>({ presque_gagne: false, a_l_etude: false, envoye: false, a_faire: true });
  const [selection, setSelection] = useState<string | null>(null);

  const cas = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of data.opportunites) if (o.charge_affaires_id) m.set(o.charge_affaires_id, o.charge_affaires_nom ?? "Sans nom");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [data]);
  const opps = useMemo(() => data.opportunites.filter((o) => ca === "tous" || o.charge_affaires_id === ca), [data, ca]);
  const groupes = useMemo(() => grouper(opps, aujourdhui), [opps, aujourdhui]);
  const sel = data.opportunites.find((o) => o.affaire_id === selection) ?? null;

  const semaines = Number(duree);
  const debut = ajouterJours(lundi(aujourdhui), decalage * 7);
  const nbJours = semaines * 7;
  const fin = ajouterJours(debut, nbJours - 1);
  const pos = (iso: string) => (ecartJours(debut, iso) / nbJours) * 100;
  const span = (a: string, b: string) => {
    const s = Math.max(0, ecartJours(debut, a));
    const e = Math.min(nbJours, ecartJours(debut, b) + 1);
    return e <= s ? null : { left: `${(s / nbJours) * 100}%`, width: `${((e - s) / nbJours) * 100}%` };
  };
  const semainesCols = Array.from({ length: semaines }, (_, i) => ajouterJours(debut, i * 7));
  const fermetures = Array.from({ length: nbJours }, (_, i) => ajouterJours(debut, i)).filter((d) => estFermeture(d, p));

  const pastilles = (liste: OppPlanning[], vide: string) =>
    liste.length === 0 ? <p className="text-xs text-muted-foreground">{vide}</p> : (
      <div className="flex flex-wrap gap-1.5">
        {liste.map((o) => (
          <Link key={o.affaire_id} to="/opportunites/$affaireId" params={{ affaireId: o.affaire_id }}
            className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs hover:border-primary hover:text-primary" title={o.nom ?? ""}>
            {o.numero}
          </Link>
        ))}
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-sm font-semibold">À dater <span className="text-muted-foreground">({aDater(opps).length})</span></p>
          {pastilles(aDater(opps), "Toutes les opportunités ouvertes ont une date.")}
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-sm font-semibold">Date passée, à clore <span className="text-muted-foreground">({datePasseeAClore(opps, aujourdhui).length})</span></p>
          {pastilles(datePasseeAClore(opps, aujourdhui), "Aucune opportunité ouverte avec une date passée.")}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={ca} onValueChange={setCa}>
          <SelectTrigger className="w-[240px]" aria-label="Chargé d'affaires"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les chargés d'affaires</SelectItem>
            {cas.map(([id, nom]) => <SelectItem key={id} value={id}>{nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <ToggleGroup type="single" value={duree} onValueChange={(v) => v && setDuree(v as "16" | "26")} className="rounded-lg border border-border">
          <ToggleGroupItem value="16" className="px-3 text-xs">16 semaines</ToggleGroupItem>
          <ToggleGroupItem value="26" className="px-3 text-xs">6 mois</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Période précédente" onClick={() => setDecalage((d) => d - 4)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setDecalage(0)}>Aujourd'hui</Button>
          <Button variant="outline" size="icon" aria-label="Période suivante" onClick={() => setDecalage((d) => d + 4)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <span className="text-xs text-muted-foreground">{fmtJJMM(debut)} → {fmtJJMM(fin)}/{fin.slice(0, 4)}</span>
      </div>

      <Legende />

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <div className="min-w-[760px] sm:min-w-[900px]">
          <div className="sticky top-0 z-10 flex border-b border-border bg-card text-[10px] text-muted-foreground">
            <div className="w-36 shrink-0 sm:w-56 px-3 py-2 font-semibold uppercase tracking-wide">Opportunité</div>
            <div className="relative flex-1">
              <div className="flex h-full">
                {semainesCols.map((s) => <div key={s} className="flex-1 border-l border-border px-1 py-2">{fmtJJMM(s)}</div>)}
              </div>
            </div>
          </div>
          {GROUPES.map((g) => {
            const liste = groupes[g];
            return (
              <div key={g}>
                <button type="button" onClick={() => setReplies((r) => ({ ...r, [g]: !r[g] }))}
                  className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-left text-xs font-semibold">
                  {replies[g] ? <Chevron className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <span className={cn("h-2.5 w-2.5 rounded-full", COULEUR[g].bar)} />
                  {GROUPE_LABEL[g]} ({param(p, `proba_${g}`)} %) <span className="font-normal text-muted-foreground">· {liste.length}</span>
                </button>
                {!replies[g] && liste.map((o) => {
                  const per = calculerPeriodes(o, p)!;
                  const sig = etatSignature(per.limiteSignature, aujourdhui);
                  const ech = span(per.echantillons.debut, per.echantillons.fin);
                  const fab = span(per.fabrication.debut, per.fabrication.fin);
                  const cli = span(per.client.debut, per.client.fin);
                  const lim = per.limiteSignature >= debut && per.limiteSignature <= fin ? pos(per.limiteSignature) : null;
                  const cmd = per.commande && per.commande >= debut && per.commande <= fin ? pos(per.commande) : null;
                  return (
                    <button type="button" key={o.affaire_id} onClick={() => setSelection(o.affaire_id)}
                      className={cn("flex w-full border-b border-border text-left hover:bg-muted/30", selection === o.affaire_id && "bg-primary/5")}>
                      <div className="w-36 shrink-0 sm:w-56 px-3 py-1.5">
                        <p className="truncate text-xs font-semibold">{o.numero} <span className="font-normal">{titre(o)}</span></p>
                        <p className={cn("truncate text-[10px]", sig.niveau === "hors_delai" ? "text-destructive" : sig.niveau === "proche" ? "text-su-orange" : "text-muted-foreground")}>{sig.libelle}</p>
                      </div>
                      <div className="relative h-11 flex-1">
                        {fermetures.map((d) => <div key={d} className="absolute inset-y-0 bg-muted" style={{ left: `${pos(d)}%`, width: `${100 / nbJours}%` }} />)}
                        {semainesCols.map((s) => <div key={s} className="absolute inset-y-0 border-l border-border/60" style={{ left: `${pos(s)}%` }} />)}
                        {ech && <div className="absolute top-3 h-5 rounded-sm bg-su-orange" style={ech} title={`Échantillons, plans, repérage ${fmtJJMM(per.echantillons.debut)} → ${fmtJJMM(per.echantillons.fin)}`} />}
                        {fab && <div className={cn("absolute top-3 h-5 rounded-sm opacity-70", COULEUR[g].bar)} style={{ ...fab, backgroundImage: "repeating-linear-gradient(45deg, transparent 0 4px, var(--card) 4px 7px)" }} title={`Fabrication estimée ${fmtJJMM(per.fabrication.debut)} → ${fmtJJMM(per.fabrication.fin)}`} />}
                        {cli && <div className={cn("absolute top-3 h-5 rounded-sm", COULEUR[g].bar)} style={cli} title={`Période client ${fmtJJMM(per.client.debut)} → ${fmtJJMM(per.client.fin)}`} />}
                        {lim != null && <div className={cn("absolute inset-y-1 w-0.5", sig.niveau === "hors_delai" ? "bg-destructive" : sig.niveau === "proche" ? "bg-su-orange" : "bg-su-vert")} style={{ left: `${lim}%` }} title={sig.libelle} />}
                        {cmd != null && <ShoppingCart className="absolute top-0 h-3 w-3 -translate-x-1/2 text-foreground" style={{ left: `${cmd}%` }} aria-label={`Commande matière le ${fmtJJMM(per.commande!)}`} />}
                        {aujourdhui >= debut && aujourdhui <= fin && <div className="absolute inset-y-0 w-px bg-destructive/70" style={{ left: `${pos(aujourdhui)}%` }} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Lecture seule. Ce planning probable est séparé de la charge réelle : aucun chiffre n'est repris dans le pilotage, l'atelier ou la logistique.</p>

      <MateriauxACommander data={data} opps={opps} selection={sel} />

      <Sheet open={!!sel} onOpenChange={(o) => !o && setSelection(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {sel && <Fiche o={sel} p={p} couts={data.couts} aujourdhui={aujourdhui} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Legende() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-su-orange" />Échantillons, plans, repérage</span>
      <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-su-bleu opacity-70" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent 0 3px, var(--card) 3px 5px)" }} />Fabrication estimée</span>
      <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-su-bleu" />Période client</span>
      <span className="flex items-center gap-1"><span className="h-3 w-0.5 bg-destructive" />Limite de signature</span>
      <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />Commande matière</span>
      <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-muted" />Fermeture</span>
    </div>
  );
}

function Fiche({ o, p, couts, aujourdhui }: { o: OppPlanning; p: Parametres; couts: boolean; aujourdhui: string }) {
  const per = calculerPeriodes(o, p);
  const sig = per ? etatSignature(per.limiteSignature, aujourdhui) : null;
  const ligne = (l: string, v: string) => <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{l}</span><span className="text-right">{v}</span></div>;
  return (
    <div className="space-y-4">
      <SheetHeader><SheetTitle>{o.numero} — {titre(o)}</SheetTitle></SheetHeader>
      <div className="space-y-1">
        {ligne("Client", o.client_nom ?? "—")}
        {ligne("Statut", `${GROUPE_LABEL[o.statut]} (${param(p, `proba_${o.statut}`)} %)`)}
        {ligne("Chargé d'affaires", o.charge_affaires_nom ?? "—")}
        {ligne("Taille", o.taille ? TAILLE[o.taille] ?? o.taille : "Taille à renseigner")}
        {couts && ligne("Montant du devis HT", o.devis_id ? eur(o.montant_ht) : "Pas de devis")}
      </div>
      {sig && <div className={cn("rounded-lg border px-3 py-2 text-sm font-medium", sig.niveau === "hors_delai" ? "border-destructive text-destructive" : sig.niveau === "proche" ? "border-su-orange text-su-orange" : "border-su-vert text-su-vert")}>{sig.libelle}</div>}
      {per ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phases</p>
          {ligne("Échantillons, plans, repérage", `${fmtJJMM(per.echantillons.debut)} → ${fmtJJMM(per.echantillons.fin)}`)}
          {ligne("Fabrication estimée", `${fmtJJMM(per.fabrication.debut)} → ${fmtJJMM(per.fabrication.fin)} (${per.fabrication.semaines} sem.)`)}
          <p className="text-[11px] text-muted-foreground">{per.fabrication.source === "devis" ? `D'après ${qte(o.heures_fabrication)} h de fabrication du devis.` : per.fabrication.source === "taille" ? "Durée par défaut selon la taille (devis sans heures de fabrication)." : "Taille à renseigner : durée par défaut appliquée."}</p>
          {ligne("Période client", `${fmtJJMM(per.client.debut)} → ${fmtJJMM(per.client.fin)}`)}
          {ligne("Commande matière", per.commande ? fmtJJMM(per.commande) : "Pas de matière au devis")}
        </div>
      ) : <p className="text-sm text-muted-foreground">À dater : ni date de montage ni date d'événement.</p>}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Matériaux du devis</p>
        {o.materiaux.length === 0 ? <p className="text-sm text-muted-foreground">Aucun.</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Désignation</th><th className="text-right">Qté</th><th>Fournisseur</th>{couts && <th className="text-right">Achat</th>}<th>Stock</th></tr></thead>
            <tbody>{materiauxFiche(o).map((m, i) => (
              <tr key={i} className="border-t border-border align-top">
                <td className="py-1 pr-2">{texte(m.designation)}{m.a_prix === false && <span className="text-muted-foreground"> (sans prix, non consolidé)</span>}</td>
                <td className="whitespace-nowrap text-right">{qte(m.quantite)} {m.unite}</td>
                <td className="pl-2">{m.fournisseur ?? "—"}</td>
                {couts && <td className="text-right">{eur(m.achat)}</td>}
                <td className="pl-2 text-muted-foreground">non suivi</td>
              </tr>))}</tbody>
          </table>
        )}
        {o.autres_lignes.length > 0 && (
          <div className="mt-2">
            <p className="text-[11px] text-muted-foreground">Autres lignes (lots, locations, prestataires) — non consolidées :</p>
            <ul className="text-xs">{o.autres_lignes.map((l, i) => <li key={i}>{texte(l.designation)} — {qte(l.quantite)} {l.unite ?? ""}</li>)}</ul>
          </div>
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prochaine action</p>
        {o.prochaine_action ? <p className="text-sm">{o.prochaine_action.due ? `${fmtJJMM(o.prochaine_action.due)} · ` : ""}{o.prochaine_action.texte ?? o.prochaine_action.type}</p> : <p className="text-sm text-muted-foreground">Aucune.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm"><Link to="/opportunites/$affaireId" params={{ affaireId: o.affaire_id }}>Ouvrir l'opportunité</Link></Button>
        {o.devis_id && <Button asChild size="sm" variant="outline"><Link to="/affaires/$affaireId/devis-staffing" params={{ affaireId: o.affaire_id }}>Ouvrir le devis</Link></Button>}
      </div>
    </div>
  );
}

function MateriauxACommander({ data, opps, selection }: { data: PlanningData; opps: OppPlanning[]; selection: OppPlanning | null }) {
  const [statuts, setStatuts] = useState<StatutOuvert[]>(["presque_gagne", "a_l_etude", "envoye"]);
  const [mode, setMode] = useState<"toutes" | "selection">("toutes");
  const { lignes, semaines } = useMemo(
    () => regrouperMateriaux(opps, data.parametres, { statuts, affaireId: mode === "selection" ? selection?.affaire_id ?? "__aucune__" : null }),
    [opps, data.parametres, statuts, mode, selection],
  );
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Matériaux à commander</h2>
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Stock non suivi : l'application Stock ne compte encore que quelques mouvements, elle n'est pas reliée à ce planning. Quantités non pondérées par la probabilité ; lots, locations et prestataires visibles seulement dans la fiche.</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {GROUPES.map((g) => (
          <div key={g} className="flex items-center gap-1.5">
            <Checkbox id={`mat-${g}`} checked={statuts.includes(g)} onCheckedChange={(c) => setStatuts((s) => c ? [...s, g] : s.filter((x) => x !== g))} />
            <Label htmlFor={`mat-${g}`} className="text-xs">{GROUPE_LABEL[g]}</Label>
          </div>
        ))}
        <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as "toutes" | "selection")} className="rounded-lg border border-border">
          <ToggleGroupItem value="toutes" className="px-3 text-xs">Toutes les opportunités</ToggleGroupItem>
          <ToggleGroupItem value="selection" className="px-3 text-xs">Opportunité sélectionnée</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {mode === "selection" && !selection && <p className="text-xs text-muted-foreground">Cliquez sur une ligne du calendrier pour choisir une opportunité.</p>}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[700px] text-xs">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2">Matériau</th>
              {semaines.map((s) => <th key={s} className="px-2 py-2 text-right">Sem. {fmtJJMM(s)}</th>)}
              <th className="px-2 py-2 text-right">Total</th>
              {data.couts && <th className="px-2 py-2 text-right">Achat HT</th>}
              <th className="px-2 py-2">Stock</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && <tr><td colSpan={semaines.length + 4} className="px-3 py-4 text-center text-muted-foreground">Aucun matériau à commander pour cette sélection.</td></tr>}
            {lignes.map((l) => (
              <tr key={l.cle} className="border-t border-border align-top">
                <td className="px-3 py-1.5"><p className="font-medium">{texte(l.designation)}</p><p className="text-[10px] text-muted-foreground">{l.numeros.join(", ")}</p></td>
                {semaines.map((s) => (
                  <td key={s} className="px-2 py-1.5 text-right">{l.parSemaine[s] ? <><p>{qte(l.parSemaine[s].quantite)} {l.unite}</p><p className="text-[10px] text-muted-foreground">{l.parSemaine[s].numeros.join(", ")}</p></> : ""}</td>
                ))}
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">{qte(l.total)} {l.unite}</td>
                {data.couts && <td className="px-2 py-1.5 text-right">{eur(l.achatHT)}</td>}
                <td className="px-2 py-1.5 text-muted-foreground">non suivi</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
