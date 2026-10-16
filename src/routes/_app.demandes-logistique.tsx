import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarPlus, Loader2, MailOpen, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { requireCapability } from "@/lib/capability-guard";
import { useCapability } from "@/hooks/use-capability";
import { supabase } from "@/integrations/supabase/client";
import { EmailReaderDialog } from "@/components/emails/EmailReaderDialog";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_app/demandes-logistique")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({
    meta: [
      { title: "Demandes logistique — log@setup.paris" },
      { name: "description", content: "Emails log@ analysés par l'IA : échéances détectées et suggestions d'étapes logistiques." },
      { property: "og:title", content: "Demandes logistique — log@setup.paris" },
      { property: "og:description", content: "Emails log@ analysés par l'IA avec suggestions de planning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DemandesLogistiquePage,
});

const TYPES = ["appro", "emballage", "chargement", "livraison", "montage", "finitions", "permanence", "demontage", "dechargement"] as const;
type EtapeType = (typeof TYPES)[number];
const TYPE_LABEL: Record<EtapeType, string> = {
  appro: "Appro", emballage: "Emballage", chargement: "Chargement", livraison: "Livraison", montage: "Montage",
  finitions: "Finitions", permanence: "Permanence", demontage: "Démontage", dechargement: "Déchargement",
};

type Echeance = { date: string; libelle: string; type?: string | null; affaire_numero?: string | null };
type Meta = { resume?: string | null; opp_client?: string | null; opp_projet?: string | null; opp_lieu?: string | null; echeances?: Echeance[] | null };
type Row = {
  id: string; from_email: string; from_name: string | null; subject: string | null; received_at: string;
  body_preview: string | null; body_full: string | null; body_content_type: string | null;
  statut: "pending_review" | "validated" | "dismissed"; metadata_ia: Meta | null;
};
type Aff = { id: string; numero: string; nom: string };

function DemandesLogistiquePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"todo" | "done" | "dismissed">("todo");
  const [reading, setReading] = useState<Row | null>(null);
  const [planning, setPlanning] = useState<Row | null>(null);
  const [affaires, setAffaires] = useState<Aff[]>([]);
  const canEdit = useCapability("logistique.etape.edit");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("emails_entrants")
      .select("id, from_email, from_name, subject, received_at, body_preview, body_full, body_content_type, statut, metadata_ia")
      .eq("source_boite", "logistique")
      .order("received_at", { ascending: false })
      .limit(300);
    if (error) toast.error("Chargement impossible", { description: error.message });
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }
  useEffect(() => {
    void load();
    void supabase.from("affaires").select("id, numero, nom").eq("phase", "signe").is("archived_at", null)
      .order("numero", { ascending: false }).then(({ data }) => setAffaires((data ?? []) as Aff[]));
  }, []);

  const lists = useMemo(() => ({
    todo: rows.filter((r) => r.statut === "pending_review"),
    done: rows.filter((r) => r.statut === "validated"),
    dismissed: rows.filter((r) => r.statut === "dismissed"),
  }), [rows]);

  async function setStatut(r: Row, statut: Row["statut"]) {
    const { error } = await supabase.from("emails_entrants").update({ statut }).eq("id", r.id);
    if (error) return toast.error("Erreur", { description: error.message });
    void load();
  }

  const list = lists[tab];
  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="Demandes logistique" description="Emails reçus sur log@setup.paris — l'IA repère les échéances et propose des étapes pour le planning." />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="todo">À traiter <span className="ml-1.5 text-xs opacity-60">{lists.todo.length}</span></TabsTrigger>
          <TabsTrigger value="done">Planifiées <span className="ml-1.5 text-xs opacity-60">{lists.done.length}</span></TabsTrigger>
          <TabsTrigger value="dismissed">Écartées <span className="ml-1.5 text-xs opacity-60">{lists.dismissed.length}</span></TabsTrigger>
        </TabsList>
      </Tabs>
      {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Aucun email ici.</p>
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const m = r.metadata_ia ?? {};
            const ech = m.echeances ?? [];
            return (
              <div key={r.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.opp_projet || r.subject || "(sans objet)"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.from_name ? `${r.from_name} · ` : ""}{r.from_email} · {format(parseISO(r.received_at), "d MMM yyyy HH:mm", { locale: fr })}
                      {m.opp_client ? ` · ${m.opp_client}` : ""}{m.opp_lieu ? ` · ${m.opp_lieu}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setReading(r)}><MailOpen className="mr-1 h-4 w-4" />Lire l'email</Button>
                    {canEdit && r.statut === "pending_review" && (
                      <>
                        <Button size="sm" onClick={() => setPlanning(r)}><CalendarPlus className="mr-1 h-4 w-4" />Ajouter au planning</Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatut(r, "dismissed")} aria-label="Écarter"><X className="h-4 w-4" /></Button>
                      </>
                    )}
                    {canEdit && r.statut !== "pending_review" && (
                      <Button size="sm" variant="ghost" onClick={() => setStatut(r, "pending_review")}>Remettre à traiter</Button>
                    )}
                  </div>
                </div>
                {m.resume && <p className="text-sm">{m.resume}</p>}
                {ech.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ech.map((e, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        <Truck className="h-3 w-3" />
                        {format(parseISO(e.date), "d MMM", { locale: fr })} · {e.libelle}
                        {e.affaire_numero ? ` · ${e.affaire_numero}` : ""}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {reading && <EmailReaderDialog email={reading} onClose={() => setReading(null)} />}
      {planning && (
        <PlanningDialog row={planning} affaires={affaires} onClose={() => setPlanning(null)}
          onDone={() => { setPlanning(null); void load(); }} />
      )}
    </div>
  );
}

type Line = { keep: boolean; date: string; type: EtapeType; contenu: string };

function PlanningDialog({ row, affaires, onClose, onDone }: { row: Row; affaires: Aff[]; onClose: () => void; onDone: () => void }) {
  const ech = row.metadata_ia?.echeances ?? [];
  const numero = ech.find((e) => e.affaire_numero)?.affaire_numero;
  const [affaireId, setAffaireId] = useState<string>(affaires.find((a) => a.numero === numero)?.id ?? "");
  const [lines, setLines] = useState<Line[]>(() => (ech.length ? ech : [{ date: format(new Date(), "yyyy-MM-dd"), libelle: row.subject ?? "", type: "livraison" }]).map((e) => ({
    keep: true, date: e.date, contenu: e.libelle,
    type: (TYPES as readonly string[]).includes(e.type ?? "") ? (e.type as EtapeType) : "livraison",
  })));
  const [saving, setSaving] = useState(false);
  const upd = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function save() {
    const kept = lines.filter((l) => l.keep && /^\d{4}-\d{2}-\d{2}$/.test(l.date));
    if (!affaireId || kept.length === 0) return toast.error("Choisissez un chantier et au moins une étape datée");
    setSaving(true);
    const { error } = await supabase.from("affaire_etapes_logistiques").insert(kept.map((l) => ({
      affaire_id: affaireId, type: l.type, date_debut: l.date, contenu: l.contenu,
      statut: "valide" as const, origine: "jalonnement" as const,
      note: `Depuis un email log@ : « ${(row.subject ?? "").slice(0, 120)} »`,
    })));
    if (!error) await supabase.from("emails_entrants").update({ statut: "validated" }).eq("id", row.id);
    setSaving(false);
    if (error) return toast.error("Ajout impossible", { description: error.message });
    toast.success(`${kept.length} étape(s) ajoutée(s) au planning logistique`);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajouter au planning logistique</DialogTitle>
          <DialogDescription>Suggestions de l'IA — corrigez, décochez ce qui ne doit pas être ajouté.</DialogDescription>
        </DialogHeader>
        <Select value={affaireId} onValueChange={setAffaireId}>
          <SelectTrigger><SelectValue placeholder="Chantier à rattacher…" /></SelectTrigger>
          <SelectContent>
            {affaires.map((a) => <SelectItem key={a.id} value={a.id}>{a.numero} — {a.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox checked={l.keep} onCheckedChange={(v) => upd(i, { keep: !!v })} />
              <Input type="date" className="w-40" value={l.date} onChange={(e) => upd(i, { date: e.target.value })} />
              <Select value={l.type} onValueChange={(v) => upd(i, { type: v as EtapeType })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
              <Input value={l.contenu} onChange={(e) => upd(i, { contenu: e.target.value })} />
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setLines((ls) => [...ls, { keep: true, date: format(new Date(), "yyyy-MM-dd"), type: "livraison", contenu: "" }])}>+ Ajouter une étape</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Ajouter au planning</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
