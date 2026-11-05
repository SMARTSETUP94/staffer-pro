import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Copy, Loader2, Plus, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireCapability } from "@/lib/capability-guard";
import { useCapability } from "@/hooks/use-capability";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ajouterJours, basculerQualif, CACES_OPTIONS, etatJour, joursSemaine, libelleJour, libelleLimite, messageWhatsApp,
  normaliserTelephone, numeroSemaine, passeFiltreDispos, PERMIS_OPTIONS, plageSemaine, type JourDispo,
} from "@/lib/dispos";

export const Route = createFileRoute("/_app/logistique/dispos")({
  beforeLoad: () => requireCapability("dispos.view"),
  head: () => ({
    meta: [
      { title: "Dispos des équipes — Setup Paris" },
      { name: "description", content: "Disponibilités hebdomadaires des intervenants pour les montages et démontages." },
      { property: "og:title", content: "Dispos des équipes — Setup Paris" },
      { property: "og:description", content: "Tableau des disponibilités de la semaine pour la logistique." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DisposStaffingPage,
});

type Intervenant = {
  id: string; prenom: string; nom: string; telephone: string; permis: string[]; caces: string[];
  caces_autre: string | null; actif: boolean; a_valider: boolean;
};

function DisposStaffingPage() {
  const canEdit = useCapability("dispos.edit");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [debut, setDebut] = useState<string | null>(null);
  const [sansReponse, setSansReponse] = useState(false);
  const [fPermis, setFPermis] = useState<string>("tous");
  const [fCaces, setFCaces] = useState<string>("tous");
  const [fJour, setFJour] = useState<string>("tous");
  const [fMoment, setFMoment] = useState<string>("tous");
  const [ajout, setAjout] = useState(false);

  const ouverte = useQuery({
    queryKey: ["dispos", "ouverte"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dispos_public_semaine");
      if (error) throw error;
      return data as unknown as { debut: string; heure_limite: string };
    },
  });
  const semaineDebut = debut ?? ouverte.data?.debut ?? null;
  const dates = useMemo(() => (semaineDebut ? joursSemaine(semaineDebut) : []), [semaineDebut]);

  const donnees = useQuery({
    queryKey: ["dispos", "semaine", semaineDebut],
    enabled: !!semaineDebut,
    queryFn: async () => {
      const fin = ajouterJours(semaineDebut!, 6);
      const [i, j, n, s] = await Promise.all([
        supabase.from("dispos_intervenants").select("id,prenom,nom,telephone,permis,caces,caces_autre,actif,a_valider").eq("actif", true),
        supabase.from("dispos_jours").select("intervenant_id,jour,journee,soiree,pas_dispo,source").gte("jour", semaineDebut!).lte("jour", fin),
        supabase.from("dispos_notes").select("intervenant_id,note,envoye_le").eq("semaine", semaineDebut!),
        supabase.from("dispos_semaines").select("debut,heure_limite").eq("debut", semaineDebut!).maybeSingle(),
      ]);
      const err = i.error || j.error || n.error || s.error;
      if (err) throw err;
      return { intervenants: (i.data ?? []) as Intervenant[], jours: j.data ?? [], notes: n.data ?? [], semaine: s.data };
    },
  });

  const lignes = useMemo(() => {
    if (!donnees.data) return [];
    return donnees.data.intervenants
      .map((p) => {
        const jours: Record<string, Partial<JourDispo> & { source?: string }> = {};
        for (const j of donnees.data.jours) if (j.intervenant_id === p.id) jours[j.jour] = j;
        const note = donnees.data.notes.find((x) => x.intervenant_id === p.id);
        const repondu = !!note || Object.keys(jours).length > 0;
        return { ...p, jours, note: note?.note ?? null, repondu };
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.prenom.localeCompare(b.prenom, "fr"));
  }, [donnees.data]);

  const filtrees = lignes.filter(
    (l) =>
      (!sansReponse || !l.repondu) &&
      passeFiltreDispos(l, {
        permis: fPermis === "tous" ? null : fPermis,
        caces: fCaces === "tous" ? null : fCaces,
        jour: fJour === "tous" ? null : fJour,
        moment: fMoment === "tous" ? null : (fMoment as "journee" | "soiree"),
      }),
  );
  const nbRep = lignes.filter((l) => l.repondu).length;
  const parJour = dates.map((d) => lignes.filter((l) => l.jours[d]?.journee).length);
  const limite = donnees.data?.semaine?.heure_limite ?? null;

  const rafraichir = () => qc.invalidateQueries({ queryKey: ["dispos"] });

  const ecrireCellule = async (intervenantId: string, jour: string, v: "J" | "S" | "J+S" | "pas" | "vide") => {
    const res = v === "vide"
      ? await supabase.from("dispos_jours").delete().eq("intervenant_id", intervenantId).eq("jour", jour)
      : await supabase.from("dispos_jours").upsert({
          intervenant_id: intervenantId, jour, journee: v === "J" || v === "J+S", soiree: v === "S" || v === "J+S",
          pas_dispo: v === "pas", source: "saisie_logistique", maj_le: new Date().toISOString(), maj_par: user?.id ?? null,
        }, { onConflict: "intervenant_id,jour" });
    if (res.error) toast.error("Correction refusée", { description: res.error.message });
    else void rafraichir();
  };

  const copier = async () => {
    if (!semaineDebut || !limite) return;
    await navigator.clipboard.writeText(messageWhatsApp(semaineDebut, limite, `${window.location.origin}/dispos`));
    toast.success("Message WhatsApp copié");
  };

  if (!semaineDebut) return <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        eyebrow="Logistique"
        title={`Dispos semaine ${numeroSemaine(semaineDebut)} · ${plageSemaine(semaineDebut)}`}
        description={limite ? `Réponses jusqu'au ${libelleLimite(limite)}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Semaine précédente" onClick={() => setDebut(ajouterJours(semaineDebut, -7))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setDebut(null)}>Semaine ouverte</Button>
            <Button variant="outline" size="icon" aria-label="Semaine suivante" onClick={() => setDebut(ajouterJours(semaineDebut, 7))}><ChevronRight className="h-4 w-4" /></Button>
            <Button onClick={copier} disabled={!limite}><Copy className="mr-1 h-4 w-4" />Copier le message WhatsApp</Button>
            <Button variant="outline" disabled title="Bientôt"><CalendarCheck className="mr-1 h-4 w-4" />Pré-remplir le planning (bientôt)</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-[auto_auto_1fr]">
        <Tuile label="Réponses" valeur={nbRep} />
        <Tuile label="Sans réponse" valeur={lignes.length - nbRep} />
        <div className="col-span-2 rounded-lg border border-border bg-card p-3 md:col-span-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Dispos en journée</p>
          <div className="mt-1 grid grid-cols-7 gap-1 text-center">
            {dates.map((d, i) => (
              <div key={d}><div className="text-xs text-muted-foreground">{libelleJour(d).slice(0, 3)}</div><div className="text-lg font-semibold tabular-nums">{parJour[i]}</div></div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm"><Switch checked={sansReponse} onCheckedChange={setSansReponse} />Sans réponse</label>
        <Filtre label="Permis" valeur={fPermis} onChange={setFPermis} options={PERMIS_OPTIONS.filter((o) => o.value !== "aucun")} />
        <Filtre label="CACES" valeur={fCaces} onChange={setFCaces} options={CACES_OPTIONS.filter((o) => o.value !== "aucun")} />
        <Filtre label="Dispo le" valeur={fJour} onChange={setFJour} options={dates.map((d) => ({ value: d, label: libelleJour(d) }))} />
        {fJour !== "tous" && (
          <Filtre label="Moment" valeur={fMoment} onChange={setFMoment} tousLabel="Journée ou soirée"
            options={[{ value: "journee", label: "Journée" }, { value: "soiree", label: "Soirée" }]} />
        )}
        {canEdit && <Button variant="outline" onClick={() => setAjout(true)}><Plus className="mr-1 h-4 w-4" />Ajouter une personne</Button>}
        {canEdit && limite && <HeureLimite debut={semaineDebut} limite={limite} onOk={rafraichir} />}
      </div>

      {donnees.isLoading ? (
        <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : donnees.error ? (
        <p className="text-sm text-destructive">Lecture impossible : {(donnees.error as Error).message}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">Nom</th>
                <th className="px-3 py-2 font-semibold">Permis / CACES</th>
                {dates.map((d) => <th key={d} className="px-1 py-2 text-center font-semibold">{libelleJour(d)}</th>)}
                <th className="px-3 py-2 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">Personne ne correspond.</td></tr>
              )}
              {filtrees.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.nom.toUpperCase()} {l.prenom}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{l.telephone.replace(/(\d{2})(?=\d)/g, "$1 ")}</div>
                    {l.a_valider && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 text-xs text-foreground">
                        À rattacher
                        {canEdit && (
                          <button className="underline" onClick={async () => {
                            const { error } = await supabase.from("dispos_intervenants").update({ a_valider: false }).eq("id", l.id);
                            if (error) toast.error(error.message); else void rafraichir();
                          }}>valider</button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {[...l.permis.filter((p) => p !== "aucun"), ...l.caces.filter((c) => c !== "aucun"), ...(l.caces_autre ? [l.caces_autre] : [])].map((t) => (
                        <span key={t} className="rounded border border-border px-1.5 text-xs">{t}</span>
                      ))}
                    </div>
                  </td>
                  {dates.map((d) => (
                    <td key={d} className="px-1 py-1">
                      <Cellule jour={l.jours[d]} canEdit={canEdit} onChoix={(v) => ecrireCellule(l.id, d, v)} />
                    </td>
                  ))}
                  <td className="max-w-[240px] px-3 py-2 text-xs text-muted-foreground">{l.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <Legende classe="bg-su-bleu text-su-carte" texte="Journée" />
        <Legende classe="bg-su-profond text-su-carte" texte="Soirée" />
        <Legende classe="bg-su-profond text-su-carte" texte="J + S" />
        <Legende classe="bg-su-vide text-su-second" texte="—" libelle="Pas dispo ou sans réponse" />
        <span>Le point • signale une correction de la logistique.</span>
      </div>
      {canEdit && <AjoutDialog open={ajout} onOpenChange={setAjout} onOk={rafraichir} />}
    </div>
  );
}

function Tuile({ label, valeur }: { label: string; valeur: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{valeur}</p>
    </div>
  );
}
function Legende({ classe, texte, libelle }: { classe: string; texte: string; libelle?: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`rounded px-2 py-0.5 font-medium ${classe}`}>{texte}</span>{libelle ?? texte}</span>;
}
function Filtre({ label, valeur, onChange, options, tousLabel = "Tous" }: {
  label: string; valeur: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[]; tousLabel?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={valeur} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">{tousLabel}</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Cellule({ jour, canEdit, onChoix }: {
  jour?: Partial<JourDispo> & { source?: string }; canEdit: boolean; onChoix: (v: "J" | "S" | "J+S" | "pas" | "vide") => void;
}) {
  const e = etatJour(jour);
  const classe = e === "J" ? "bg-su-bleu text-su-carte" : e === "S" || e === "J+S" ? "bg-su-profond text-su-carte" : "bg-su-vide text-su-second";
  const texte = e === "J" ? "Journée" : e === "S" ? "Soirée" : e === "J+S" ? "J + S" : "—";
  const titre = e === "pas" ? "Pas dispo" : e === "vide" ? "Sans réponse" : texte;
  const corps = (
    <span className={`flex h-9 w-full items-center justify-center rounded text-xs font-semibold ${classe}`} title={titre}>
      {texte}{jour?.source === "saisie_logistique" ? " •" : ""}
    </span>
  );
  if (!canEdit) return corps;
  return (
    <Popover>
      <PopoverTrigger asChild><button className="block w-full" aria-label={`Corriger : ${titre}`}>{corps}</button></PopoverTrigger>
      <PopoverContent className="w-44 p-1">
        {([["J", "Journée"], ["S", "Soirée"], ["J+S", "Journée + soirée"], ["pas", "Pas dispo"], ["vide", "Effacer"]] as const).map(([v, l]) => (
          <button key={v} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => onChoix(v)}>{l}</button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function HeureLimite({ debut, limite, onOk }: { debut: string; limite: string; onOk: () => void }) {
  const local = (iso: string) => {
    const d = new Date(iso);
    const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
    return p.replace(" ", "T");
  };
  const [v, setV] = useState(local(limite));
  const enregistrer = async () => {
    // Interprété en heure de Paris : on calcule le décalage du moment choisi.
    const naive = new Date(`${v}:00Z`);
    const paris = new Date(naive.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    const utc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
    const ts = new Date(naive.getTime() - (paris.getTime() - utc.getTime()));
    const { error } = await supabase.from("dispos_semaines").update({ heure_limite: ts.toISOString() }).eq("debut", debut);
    if (error) toast.error("Réglage refusé", { description: error.message });
    else { toast.success("Heure limite enregistrée"); onOk(); }
  };
  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs">Heure limite</Label>
        <Input type="datetime-local" className="h-9 w-[200px]" value={v} onChange={(e) => setV(e.target.value)} />
      </div>
      <Button variant="outline" size="sm" onClick={enregistrer}>Enregistrer</Button>
    </div>
  );
}

function AjoutDialog({ open, onOpenChange, onOk }: { open: boolean; onOpenChange: (o: boolean) => void; onOk: () => void }) {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [permis, setPermis] = useState<string[]>([]);
  const [caces, setCaces] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const telOk = normaliserTelephone(tel);
  const enregistrer = async () => {
    if (!prenom.trim() || !nom.trim() || !telOk) { toast.error("Prénom, nom et portable (06/07) obligatoires"); return; }
    setEnvoi(true);
    const { error } = await supabase.from("dispos_intervenants").insert({ prenom, nom, telephone: telOk, permis, caces });
    setEnvoi(false);
    if (error) { toast.error("Ajout refusé", { description: error.code === "23505" ? "Ce portable est déjà enregistré." : error.message }); return; }
    toast.success("Personne ajoutée");
    setPrenom(""); setNom(""); setTel(""); setPermis([]); setCaces([]);
    onOpenChange(false); onOk();
  };
  const pastilles = (opts: readonly { value: string; label: string }[], val: string[], set: (v: string[]) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => (
        <Button key={o.value} type="button" size="sm" variant={val.includes(o.value) ? "default" : "outline"} onClick={() => set(basculerQualif(val, o.value))}>{o.label}</Button>
      ))}
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ajouter une personne</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Prénom</Label><Input value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
            <div className="space-y-1"><Label>Nom</Label><Input value={nom} onChange={(e) => setNom(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Portable</Label><Input type="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="06 12 34 56 78" /></div>
          <div className="space-y-1"><Label>Permis</Label>{pastilles(PERMIS_OPTIONS, permis, setPermis)}</div>
          <div className="space-y-1"><Label>CACES</Label>{pastilles(CACES_OPTIONS, caces, setCaces)}</div>
        </div>
        <DialogFooter><Button onClick={enregistrer} disabled={envoi}>Ajouter</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
