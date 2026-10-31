import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PROJET_ROLE_ACTIVITE, PROJET_ROLE_LABELS, type ProjetRole } from "@/lib/labels";
import { ROLES_AVEC_PERIODE, affichagePilotage, nomComplet, periodesEnChevauchement, type AffichagePilotage } from "@/lib/equipe-projet";
import { useAffecterRole } from "@/hooks/use-equipe-projet";
import { ChargeBeSection } from "@/components/pilotage/ChargeBeSection";
import { EmployeRoleCombobox } from "@/components/affaire/EquipeProjetBloc";

export const Route = createFileRoute("/_app/planning-pilotage")({
  beforeLoad: () => requireCapability("planning.pilotage"),
  head: () => ({
    meta: [
      { title: "Planning BE / projets — Setup Paris" },
      { name: "description", content: "Périodes des concepteurs et responsables projet par affaire, avec signal de chevauchement." },
    ],
  }),
  component: PlanningPilotagePage,
});

type Ligne = {
  id: string; affaire_id: string; role: ProjetRole; employe_id: string; date_debut: string | null; date_fin: string | null;
  affaires: { numero: string; nom: string; phase: string | null; statut_opportunite: string | null; archived_at: string | null } | null;
  employes: { nom: string; prenom: string | null } | null;
};

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
function mondayOf(d: Date) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const wd = (x.getUTCDay() + 6) % 7; return new Date(x.getTime() - wd * DAY); }

function PlanningPilotagePage() {
  const canEdit = useCapability("affaires.edit");
  const [mois, setMois] = useState<1 | 3 | 6>(3);
  const [weekends, setWeekends] = useState(false);
  const [potentiel, setPotentiel] = useState(false);
  const [edit, setEdit] = useState<Ligne | null>(null);

  const start = useMemo(() => mondayOf(new Date()), []);
  const end = useMemo(() => new Date(start.getTime() + (mois * 30.5 * DAY)), [start, mois]);
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let t = start.getTime(); t <= end.getTime(); t += DAY) { const d = new Date(t); const wd = d.getUTCDay(); if (weekends || (wd !== 0 && wd !== 6)) out.push(d); }
    return out;
  }, [start, end, weekends]);
  const dayIso = useMemo(() => days.map(iso), [days]);
  const todayWeek = iso(mondayOf(new Date()));

  const { data: lignes = [], isLoading } = useQuery({
    queryKey: ["planning-pilotage", iso(start), iso(end)],
    queryFn: async (): Promise<Ligne[]> => {
      const { data, error } = await supabase.from("affaire_roles")
        .select("id,affaire_id,role,employe_id,date_debut,date_fin,affaires(numero,nom,phase,statut_opportunite,archived_at),employes(nom,prenom)")
        .in("role", ROLES_AVEC_PERIODE).not("date_debut", "is", null)
        .lte("date_debut", iso(end)).or(`date_fin.gte.${iso(start)},date_fin.is.null`);
      if (error) throw error;
      return ((data ?? []) as unknown as Ligne[]).filter((l) => l.affaires && !l.affaires.archived_at);
    },
  });

  const rendu = (l: Ligne): AffichagePilotage | null => affichagePilotage({ phase: l.affaires?.phase ?? null, statut_opportunite: l.affaires?.statut_opportunite });
  const visibles = lignes.filter((l) => { const r = rendu(l); return r === "plein" || r === "attenue" || (potentiel && r === "potentiel"); });

  const groupes = ROLES_AVEC_PERIODE.map((role) => {
    const parPersonne = new Map<string, Ligne[]>();
    visibles.filter((l) => l.role === role).forEach((l) => parPersonne.set(l.employe_id, [...(parPersonne.get(l.employe_id) ?? []), l]));
    return { role, personnes: [...parPersonne.entries()].sort((a, b) => nomComplet(a[1][0].employes ?? { nom: "", prenom: null }).localeCompare(nomComplet(b[1][0].employes ?? { nom: "", prenom: null }), "fr")) };
  });

  // Chevauchements : toutes affaires d'une personne (tous rôles), hors charge potentielle.
  const chevauche = useMemo(() => {
    const byEmp = new Map<string, Ligne[]>();
    lignes.filter((l) => rendu(l) !== "potentiel").forEach((l) => byEmp.set(l.employe_id, [...(byEmp.get(l.employe_id) ?? []), l]));
    const out = new Set<string>();
    byEmp.forEach((ls, emp) => periodesEnChevauchement(ls).forEach((a) => out.add(`${emp}|${a}`)));
    return out;
  }, [lignes]);

  function position(l: Ligne) {
    const s = l.date_debut!, e = l.date_fin ?? l.date_debut!;
    const i0 = dayIso.findIndex((d) => d >= s), i1 = (() => { for (let i = dayIso.length - 1; i >= 0; i--) if (dayIso[i] <= e) return i; return -1; })();
    if (i0 < 0 || i1 < 0 || i1 < i0) return null;
    return { left: i0, span: i1 - i0 + 1 };
  }
  const COL = mois === 6 ? 12 : mois === 3 ? 20 : 36;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Planning BE / projets" description="Concepteurs et responsables projet par affaire. Signé = plein, gagné / presque gagné = atténué, à faire / envoyé = charge potentielle (hachurée, jamais comptée)." />
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {([1, 3, 6] as const).map((m) => <Button key={m} size="sm" variant={mois === m ? "default" : "outline"} onClick={() => setMois(m)}>{m} mois</Button>)}
        </div>
        <div className="flex items-center gap-2"><Switch id="we" checked={weekends} onCheckedChange={setWeekends} /><Label htmlFor="we">Week-ends</Label></div>
        <div className="flex items-center gap-2"><Switch id="pot" checked={potentiel} onCheckedChange={setPotentiel} /><Label htmlFor="pot">Afficher la charge potentielle</Label></div>
        <Link to="/planning" className="text-sm text-muted-foreground underline-offset-2 hover:underline">← Planning fab</Link>
      </div>

      <ChargeBeSection canEdit={canEdit} />

      {isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <div style={{ minWidth: 220 + days.length * COL }}>
            <div className="sticky top-0 z-10 flex border-b border-border bg-muted/40 text-[10px] text-muted-foreground">
              <div className="w-[220px] shrink-0 px-2 py-1 font-medium">Personne</div>
              {days.map((d, i) => {
                const lundi = d.getUTCDay() === 1;
                return <div key={i} style={{ width: COL }} className={cn("shrink-0 border-l border-border/40 py-1 text-center", iso(mondayOf(d)) === todayWeek && "bg-primary/10 text-primary")}>
                  {lundi || mois === 1 ? d.getUTCDate() : ""}{lundi && d.getUTCDate() <= 7 ? <div className="font-semibold">{d.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" })}</div> : null}
                </div>;
              })}
            </div>
            {groupes.map(({ role, personnes }) => (
              <div key={role}>
                <div className="border-b border-border bg-card px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{PROJET_ROLE_LABELS[role]}</div>
                {personnes.length === 0 && <div className="border-b border-border px-2 py-2 text-xs italic text-muted-foreground">Aucune période planifiée.</div>}
                {personnes.map(([empId, ls]) => {
                  const comptees = ls.filter((l) => rendu(l) !== "potentiel").length;
                  // Empilement en couloirs pour éviter que les barres se recouvrent.
                  const lanes: Ligne[][] = [];
                  [...ls].sort((a, b) => a.date_debut!.localeCompare(b.date_debut!)).forEach((l) => {
                    const lane = lanes.find((ln) => (ln[ln.length - 1].date_fin ?? ln[ln.length - 1].date_debut!) < l.date_debut!);
                    if (lane) lane.push(l); else lanes.push([l]);
                  });
                  return (
                    <div key={empId} className="flex border-b border-border/60">
                      <div className="w-[220px] shrink-0 px-2 py-1.5 text-sm">
                        <div className="font-medium">{nomComplet(ls[0].employes ?? { nom: "—", prenom: null })}</div>
                        <div className="text-[10px] text-muted-foreground">{comptees} affaire{comptees > 1 ? "s" : ""}</div>
                      </div>
                      <div className="relative flex-1" style={{ height: Math.max(1, lanes.length) * 26 + 8 }}>
                        {days.map((d, i) => iso(mondayOf(d)) === todayWeek ? <div key={i} className="absolute inset-y-0 bg-primary/5" style={{ left: i * COL, width: COL }} /> : null)}
                        {lanes.flatMap((lane, li) => lane.map((l) => {
                          const pos = position(l); if (!pos) return null;
                          const r = rendu(l);
                          const over = r !== "potentiel" && chevauche.has(`${empId}|${l.affaire_id}`);
                          return (
                            <button key={l.id} type="button" onClick={() => canEdit && setEdit(l)}
                              title={`${PROJET_ROLE_ACTIVITE[l.role]} – ${l.affaires?.numero} ${l.affaires?.nom} (${l.date_debut} → ${l.date_fin ?? l.date_debut})${over ? " · chevauchement" : ""}`}
                              className={cn("absolute flex h-[22px] items-center gap-1 overflow-hidden rounded px-1.5 text-left text-[10px] font-medium",
                                r === "plein" && "bg-primary text-primary-foreground",
                                r === "attenue" && "bg-primary/30 text-foreground",
                                r === "potentiel" && "border border-dashed border-primary/50 bg-primary/5 [background-image:repeating-linear-gradient(45deg,transparent_0_4px,color-mix(in_oklab,var(--primary)_18%,transparent)_4px_8px)] text-muted-foreground",
                                over && "ring-2 ring-destructive", !canEdit && "cursor-default")}
                              style={{ left: pos.left * COL + 1, width: pos.span * COL - 2, top: 4 + li * 26 }}>
                              {over && <AlertTriangle className="h-3 w-3 shrink-0" />}
                              <span className="truncate">{PROJET_ROLE_ACTIVITE[l.role]} – {l.affaires?.numero} {l.affaires?.nom}</span>
                            </button>
                          );
                        }))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      {edit && <EditPeriodeDialog ligne={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditPeriodeDialog({ ligne, onClose }: { ligne: Ligne; onClose: () => void }) {
  const affecter = useAffecterRole();
  const [employeId, setEmployeId] = useState<string | null>(ligne.employe_id);
  const [debut, setDebut] = useState(ligne.date_debut ?? "");
  const [fin, setFin] = useState(ligne.date_fin ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await affecter({ affaireId: ligne.affaire_id, role: ligne.role, employeId, dateDebut: debut || null, dateFin: fin || null, remplacerDates: true });
      toast.success("Période enregistrée"); onClose();
    } catch (e) { toast.error("Enregistrement impossible", { description: e instanceof Error ? e.message : String(e) }); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{PROJET_ROLE_LABELS[ligne.role]} – {ligne.affaires?.numero} {ligne.affaires?.nom}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <EmployeRoleCombobox role={ligne.role} value={employeId} onChange={setEmployeId} />
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="Début" value={debut} onChange={(e) => setDebut(e.target.value)} />
            <span>→</span>
            <Input type="date" aria-label="Fin" value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={() => void save()} disabled={saving}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
