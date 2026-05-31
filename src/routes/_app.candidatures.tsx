/**
 * Page Candidatures — registre RH.
 * Cap : candidatures.view (admin, rh, chef_chantier).
 * Édition : candidatures.manage (admin, rh).
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Users, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const METIERS = [
  "construction", "métallerie", "peinture", "numérique",
  "tapisserie", "machiniste", "logistique", "suivi_projet",
];
const STATUTS = ["nouvelle", "a_rencontrer", "entretien", "embauche", "rejetee"] as const;
type Statut = (typeof STATUTS)[number];

const STATUT_LABEL: Record<Statut, string> = {
  nouvelle: "Nouvelle",
  a_rencontrer: "À rencontrer",
  entretien: "Entretien",
  embauche: "Embauché·e",
  rejetee: "Rejetée",
};

const STATUT_VARIANT: Record<Statut, "default" | "secondary" | "outline" | "destructive"> = {
  nouvelle: "default",
  a_rencontrer: "secondary",
  entretien: "secondary",
  embauche: "default",
  rejetee: "outline",
};

interface Candidat {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  poste_vise: string | null;
  metier: string | null;
  statut: Statut;
  notes: string | null;
  cv_path: string | null;
  created_at: string;
}

export const Route = createFileRoute("/_app/candidatures")({
  beforeLoad: ({ location }) => requireCapability("candidatures.view", location),
  component: CandidaturesPage,
});

function CandidaturesPage() {
  const canManage = useCapability("candidatures.manage").data ?? false;
  const [rows, setRows] = useState<Candidat[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statutFilter, setStatutFilter] = useState<Statut | "all">("all");
  const [editing, setEditing] = useState<Candidat | "new" | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidatures")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erreur chargement", { description: error.message });
    } else {
      setRows((data ?? []) as Candidat[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statutFilter !== "all" && r.statut !== statutFilter) return false;
      if (!ql) return true;
      const hay = `${r.nom} ${r.prenom ?? ""} ${r.email ?? ""} ${r.poste_vise ?? ""} ${r.metier ?? ""}`.toLowerCase();
      return hay.includes(ql);
    });
  }, [rows, q, statutFilter]);

  async function updateStatut(id: string, s: Statut) {
    const { error } = await supabase.from("candidatures").update({ statut: s }).eq("id", id);
    if (error) toast.error("Erreur", { description: error.message });
    else {
      toast.success("Statut mis à jour");
      await load();
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Candidatures
          </h1>
          <p className="text-sm text-muted-foreground">
            Triées depuis l'Inbox SMART ou créées manuellement.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4 mr-1" /> Nouvelle
          </Button>
        )}
      </div>

      <Card className="p-3 flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche…" className="pl-8" />
        </div>
        <Select value={statutFilter} onValueChange={(v) => setStatutFilter(v as Statut | "all")}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            {STATUTS.map((s) => <SelectItem key={s} value={s}>{STATUT_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Aucune candidature.</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id} className="p-4 hover:shadow-sm transition">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.prenom} {r.nom}</span>
                    <Badge variant={STATUT_VARIANT[r.statut]}>{STATUT_LABEL[r.statut]}</Badge>
                    {r.metier && <Badge variant="outline" className="text-xs">{r.metier}</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {r.poste_vise ?? "Poste non précisé"}
                    {r.email && <span> · {r.email}</span>}
                    {r.telephone && <span> · {r.telephone}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Reçu le {format(parseISO(r.created_at), "d MMM yyyy", { locale: fr })}
                  </div>
                </div>
                {canManage && (
                  <Select value={r.statut} onValueChange={(v) => updateStatut(r.id, v as Statut)}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUTS.map((s) => <SelectItem key={s} value={s}>{STATUT_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <NewCandidatDialog
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function NewCandidatDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [poste, setPoste] = useState("");
  const [metier, setMetier] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!nom.trim()) {
      toast.error("Nom requis");
      return;
    }
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("candidatures").insert({
      nom: nom.trim(),
      prenom: prenom.trim() || null,
      email: email.trim() || null,
      telephone: tel.trim() || null,
      poste_vise: poste.trim() || null,
      metier: metier || null,
      created_by: userId ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error("Erreur", { description: error.message });
    } else {
      toast.success("Candidat créé");
      onDone();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle candidature</DialogTitle>
          <DialogDescription>Saisie manuelle.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Prénom</Label><Input value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
            <div><Label>Nom *</Label><Input value={nom} onChange={(e) => setNom(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Téléphone</Label><Input value={tel} onChange={(e) => setTel(e.target.value)} /></div>
          </div>
          <div><Label>Poste visé</Label><Input value={poste} onChange={(e) => setPoste(e.target.value)} /></div>
          <div>
            <Label>Métier</Label>
            <Select value={metier} onValueChange={setMetier}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {METIERS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
