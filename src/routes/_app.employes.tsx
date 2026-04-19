import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Search, Loader2, Table2, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMetiers } from "@/hooks/use-metiers";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { MetierBadge } from "@/components/MetierBadge";
import { EmployesSpreadsheet, type SpreadsheetRow } from "@/components/employes/EmployesSpreadsheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type ContratType = "CDI" | "CDD" | "Interim" | "Independant";

interface EmployeRow {
  id: string;
  prenom: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  mobile: string | null;
  type_contrat: ContratType;
  sous_type_contrat: string | null;
  is_apprenti: boolean;
  agence_interim: string | null;
  metier_principal_id: number;
  actif: boolean;
  non_staffing: boolean;
  date_naissance: string | null;
  adresse: string | null;
  notes: string | null;
  secondaires: number[];
}

interface FormState {
  id?: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  mobile: string;
  type_contrat: ContratType;
  sous_type_contrat: string;
  is_apprenti: boolean;
  agence_interim: string;
  metier_principal_id: number | null;
  actif: boolean;
  non_staffing: boolean;
  date_naissance: string;
  adresse: string;
  notes: string;
  secondaires: number[];
}

const emptyForm: FormState = {
  prenom: "",
  nom: "",
  email: "",
  telephone: "",
  mobile: "",
  type_contrat: "CDI",
  sous_type_contrat: "",
  is_apprenti: false,
  agence_interim: "",
  metier_principal_id: null,
  actif: true,
  non_staffing: false,
  date_naissance: "",
  adresse: "",
  notes: "",
  secondaires: [],
};

export const Route = createFileRoute("/_app/employes")({
  head: () => ({ meta: [{ title: "Employés — Setup Paris" }] }),
  component: EmployesPage,
});

function EmployesPage() {
  const { isAdminOrChef } = useAuth();
  const { metiers, byId } = useMetiers();
  const [rows, setRows] = useState<EmployeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterContrat, setFilterContrat] = useState<"all" | ContratType | "Apprenti">("all");
  const [filterActif, setFilterActif] = useState<"actifs" | "inactifs" | "tous">("actifs");
  const [viewMode, setViewMode] = useState<"liste" | "tableur">("liste");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const { data: emps, error } = await supabase
      .from("employes")
      .select("id, prenom, nom, email, telephone, mobile, type_contrat, sous_type_contrat, is_apprenti, agence_interim, metier_principal_id, actif, non_staffing, date_naissance, adresse, notes")
      .order("nom", { ascending: true })
      .limit(2000);
    if (error) {
      toast.error("Chargement impossible", { description: error.message });
      setLoading(false);
      return;
    }
    const ids = (emps ?? []).map((e) => e.id);
    let secMap: Record<string, number[]> = {};
    if (ids.length) {
      const { data: secs } = await supabase
        .from("employe_metiers")
        .select("employe_id, metier_id")
        .in("employe_id", ids);
      secMap = (secs ?? []).reduce<Record<string, number[]>>((acc, s) => {
        (acc[s.employe_id] ??= []).push(s.metier_id);
        return acc;
      }, {});
    }
    setRows((emps ?? []).map((e) => ({ ...e, secondaires: secMap[e.id] ?? [] })));
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterContrat === "Apprenti") {
        if (!r.is_apprenti) return false;
      } else if (filterContrat !== "all" && r.type_contrat !== filterContrat) return false;
      if (filterActif === "actifs" && !r.actif) return false;
      if (filterActif === "inactifs" && r.actif) return false;
      if (!q) return true;
      const hay = `${r.prenom} ${r.nom} ${r.email ?? ""} ${r.agence_interim ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, filterContrat, filterActif]);

  const spreadsheetRows: SpreadsheetRow[] = useMemo(
    () => filtered.map((r) => ({
      id: r.id, prenom: r.prenom, nom: r.nom, email: r.email,
      telephone: r.telephone, mobile: r.mobile, type_contrat: r.type_contrat,
      sous_type_contrat: r.sous_type_contrat, agence_interim: r.agence_interim,
      metier_principal_id: r.metier_principal_id, actif: r.actif, non_staffing: r.non_staffing,
    })),
    [filtered],
  );

  const openCreate = () => {
    setForm({ ...emptyForm, metier_principal_id: metiers[0]?.id ?? null });
    setOpen(true);
  };
  const openEdit = (row: EmployeRow) => {
    setForm({
      id: row.id,
      prenom: row.prenom,
      nom: row.nom,
      email: row.email ?? "",
      telephone: row.telephone ?? "",
      mobile: row.mobile ?? "",
      type_contrat: row.type_contrat,
      sous_type_contrat: row.sous_type_contrat ?? "",
      is_apprenti: row.is_apprenti,
      agence_interim: row.agence_interim ?? "",
      metier_principal_id: row.metier_principal_id,
      actif: row.actif,
      non_staffing: row.non_staffing,
      date_naissance: row.date_naissance ?? "",
      adresse: row.adresse ?? "",
      notes: row.notes ?? "",
      secondaires: row.secondaires.filter((id) => id !== row.metier_principal_id),
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.prenom.trim() || !form.nom.trim() || !form.metier_principal_id) {
      toast.error("Champs requis", { description: "Prénom, nom et métier principal." });
      return;
    }
    setSaving(true);
    const payload = {
      prenom: form.prenom.trim(),
      nom: form.nom.trim(),
      email: form.email.trim() || null,
      telephone: form.telephone.trim() || null,
      mobile: form.mobile.trim() || null,
      type_contrat: form.type_contrat,
      sous_type_contrat: form.sous_type_contrat.trim() || null,
      is_apprenti: form.is_apprenti,
      agence_interim: form.type_contrat === "Interim" ? (form.agence_interim.trim() || null) : null,
      metier_principal_id: form.metier_principal_id,
      actif: form.actif,
      non_staffing: form.non_staffing,
      date_naissance: form.date_naissance || null,
      adresse: form.adresse.trim() || null,
      notes: form.notes.trim() || null,
    };

    let employeId = form.id;
    if (employeId) {
      const { error } = await supabase.from("employes").update(payload).eq("id", employeId);
      if (error) { toast.error("Mise à jour impossible", { description: error.message }); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("employes").insert(payload).select("id").single();
      if (error || !data) { toast.error("Création impossible", { description: error?.message }); setSaving(false); return; }
      employeId = data.id;
    }

    // Compétences secondaires : on remplace
    await supabase.from("employe_metiers").delete().eq("employe_id", employeId!);
    const sec = form.secondaires.filter((id) => id !== form.metier_principal_id);
    if (sec.length) {
      await supabase
        .from("employe_metiers")
        .insert(sec.map((metier_id) => ({ employe_id: employeId!, metier_id })));
    }

    toast.success(form.id ? "Employé mis à jour" : "Employé créé");
    setOpen(false);
    setSaving(false);
    fetchAll();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        number="01"
        eyebrow="Données / Employés"
        title="Employés"
        description={`${rows.filter((r) => r.actif).length} actif(s) sur ${rows.length} fiche(s).`}
        actions={
          isAdminOrChef && (
            <Button onClick={openCreate} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" /> Nouvel employé
            </Button>
          )
        }
      />

      {/* Filtres */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher (nom, email, agence)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "liste" | "tableur")}>
            <TabsList className="rounded-xl bg-muted">
              <TabsTrigger value="liste" className="rounded-lg"><List className="mr-1 h-3.5 w-3.5" />Liste</TabsTrigger>
              <TabsTrigger value="tableur" className="rounded-lg"><Table2 className="mr-1 h-3.5 w-3.5" />Tableur</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={filterContrat} onValueChange={(v) => setFilterContrat(v as typeof filterContrat)}>
            <TabsList className="rounded-xl bg-muted">
              <TabsTrigger value="all" className="rounded-lg">Tous</TabsTrigger>
              <TabsTrigger value="CDI" className="rounded-lg">CDI</TabsTrigger>
              <TabsTrigger value="Interim" className="rounded-lg">Intérim</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={filterActif} onValueChange={(v) => setFilterActif(v as typeof filterActif)}>
            <TabsList className="rounded-xl bg-muted">
              <TabsTrigger value="actifs" className="rounded-lg">Actifs</TabsTrigger>
              <TabsTrigger value="inactifs" className="rounded-lg">Inactifs</TabsTrigger>
              <TabsTrigger value="tous" className="rounded-lg">Tous</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {viewMode === "tableur" ? (
        loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <EmployesSpreadsheet rows={spreadsheetRows} onSaved={fetchAll} />
        )
      ) : (
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Aucun employé ne correspond aux filtres.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Contrat</TableHead>
                <TableHead>Métier principal</TableHead>
                <TableHead>Compétences secondaires</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>État</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const principal = byId(r.metier_principal_id);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-semibold text-foreground">{r.nom.toUpperCase()} {r.prenom}</div>
                      {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                    </TableCell>
                    <TableCell>
                      <ContratPill type={r.type_contrat} agence={r.agence_interim} />
                    </TableCell>
                    <TableCell>
                      {principal ? (
                        <MetierBadge libelle={principal.libelle} couleur={principal.couleur} />
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.secondaires
                          .filter((id) => id !== r.metier_principal_id)
                          .map((id) => {
                            const m = byId(id);
                            return m ? <MetierBadge key={id} libelle={m.libelle} couleur={m.couleur} /> : null;
                          })}
                        {r.secondaires.filter((id) => id !== r.metier_principal_id).length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-foreground">{r.email ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.telephone ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      {r.actif
                        ? <span className="text-xs font-semibold text-success">Actif</span>
                        : <span className="text-xs font-semibold text-muted-foreground">Inactif</span>}
                    </TableCell>
                    <TableCell>
                      {isAdminOrChef && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      )}


      {/* Dialog création/édition */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifier l'employé" : "Nouvel employé"}</DialogTitle>
            <DialogDescription>
              Renseignez les informations de la fiche. Les compétences secondaires permettent de proposer cet employé sur d'autres métiers que son métier principal.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Prénom</Label>
              <Input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Type de contrat</Label>
              <Select value={form.type_contrat} onValueChange={(v) => setForm({ ...form, type_contrat: v as ContratType })}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CDI">CDI</SelectItem>
                  <SelectItem value="Interim">Intérim</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Agence intérim</Label>
              <Input
                disabled={form.type_contrat !== "Interim"}
                value={form.agence_interim}
                onChange={(e) => setForm({ ...form, agence_interim: e.target.value })}
                placeholder={form.type_contrat === "Interim" ? "Ex. Manpower" : "—"}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Métier principal</Label>
              <Select
                value={form.metier_principal_id ? String(form.metier_principal_id) : ""}
                onValueChange={(v) => setForm({ ...form, metier_principal_id: Number(v) })}
              >
                <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                <SelectContent>
                  {metiers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Compétences secondaires</Label>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-background p-3 sm:grid-cols-3">
                {metiers
                  .filter((m) => m.id !== form.metier_principal_id)
                  .map((m) => {
                    const checked = form.secondaires.includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const on = Boolean(v);
                            setForm((f) => ({
                              ...f,
                              secondaires: on
                                ? [...f.secondaires, m.id]
                                : f.secondaires.filter((id) => id !== m.id),
                            }));
                          }}
                        />
                        <span style={{ color: m.couleur }} className="font-medium">{m.libelle}</span>
                      </label>
                    );
                  })}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="rounded-xl"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3 sm:col-span-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Employé actif</p>
                <p className="text-xs text-muted-foreground">Décocher pour archiver sans supprimer.</p>
              </div>
              <Switch checked={form.actif} onCheckedChange={(v) => setForm({ ...form, actif: v })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-xl">Annuler</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? "Enregistrer" : "Créer l'employé"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContratPill({ type, agence }: { type: ContratType; agence: string | null }) {
  if (type === "CDI") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--indigo-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
        CDI
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center rounded-full bg-[var(--cream-deep)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground">
        Intérim
      </span>
      {agence && <span className="text-xs text-muted-foreground">{agence}</span>}
    </span>
  );
}
