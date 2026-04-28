import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Search, Loader2, Table2, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMetiers } from "@/hooks/use-metiers";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { MetierBadge } from "@/components/MetierBadge";
import { MultiFilter } from "@/components/planning/MultiFilter";
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

type Permis = "B" | "C" | "CE" | "D";

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
  est_livreur: boolean;
  categories_permis: Permis[];
  date_naissance: string | null;
  adresse: string | null;
  notes: string | null;
  profile_id: string | null;
  matricule_silae: string | null;
  est_chef_projet: boolean;
  est_respo_fab: boolean;
  est_finition: boolean;
  est_manutention: boolean;
  est_bureau_etude: boolean;
  est_usinage_numerique: boolean;
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
  est_livreur: boolean;
  categories_permis: Permis[];
  date_naissance: string;
  adresse: string;
  notes: string;
  matricule_silae: string;
  profile_id: string | null;
  est_chef_projet: boolean;
  est_respo_fab: boolean;
  est_finition: boolean;
  est_manutention: boolean;
  est_bureau_etude: boolean;
  est_usinage_numerique: boolean;
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
  est_livreur: false,
  categories_permis: [],
  date_naissance: "",
  adresse: "",
  notes: "",
  matricule_silae: "",
  profile_id: null,
  est_chef_projet: false,
  est_respo_fab: false,
  est_finition: false,
  est_manutention: false,
  est_bureau_etude: false,
  est_usinage_numerique: false,
  secondaires: [],
};

// v0.18.1 — Bloc 3 : options pour la section "Capacités / Permis" du dialog
const PERMIS_OPTIONS: { value: Permis; label: string }[] = [
  { value: "B", label: "B (VL / utilitaire ≤ 3.5T)" },
  { value: "C", label: "C (PL > 3.5T)" },
  { value: "CE", label: "CE (PL + remorque)" },
  { value: "D", label: "D (transport en commun)" },
];

export const Route = createFileRoute("/_app/employes")({
  head: () => ({ meta: [{ title: "Employés — Setup Paris" }] }),
  component: EmployesPage,
});

function EmployesPage() {
  const { isAdminOrChef, isAdmin } = useAuth();
  const { metiers, byId } = useMetiers();
  const [rows, setRows] = useState<EmployeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterContrat, setFilterContrat] = useState<"all" | ContratType | "Apprenti">("all");
  const [filterActif, setFilterActif] = useState<"actifs" | "inactifs" | "tous">("actifs");
  const [filterMetierPrincipal, setFilterMetierPrincipal] = useState<Set<string | number>>(new Set());
  const [filterMetierSecondaire, setFilterMetierSecondaire] = useState<Set<string | number>>(new Set());
  const [viewMode, setViewMode] = useState<"liste" | "tableur">("liste");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleActif = async (row: EmployeRow) => {
    if (!isAdminOrChef) return;
    setTogglingId(row.id);
    const next = !row.actif;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, actif: next } : r)));
    const { error } = await supabase.from("employes").update({ actif: next }).eq("id", row.id);
    setTogglingId(null);
    if (error) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, actif: !next } : r)));
      toast.error("Modification impossible", { description: error.message });
      return;
    }
    toast.success(next ? `${row.prenom} ${row.nom} → Actif` : `${row.prenom} ${row.nom} → Inactif`);
  };

  const fetchAll = async () => {
    setLoading(true);
    const { data: emps, error } = await supabase
      .from("employes")
      .select("id, prenom, nom, email, telephone, mobile, type_contrat, sous_type_contrat, is_apprenti, agence_interim, metier_principal_id, actif, non_staffing, est_livreur, categories_permis, date_naissance, adresse, notes, profile_id")
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
    const profileIds = (emps ?? []).map((e) => e.profile_id).filter((x): x is string => !!x);
    type ProfileFabRow = {
      id: string;
      matricule_silae: string | null;
      est_chef_projet: boolean;
      est_respo_fab: boolean;
      est_finition: boolean;
      est_manutention: boolean;
      est_bureau_etude: boolean;
      est_usinage_numerique: boolean;
    };
    let profileMap: Record<string, ProfileFabRow> = {};
    if (profileIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, matricule_silae, est_chef_projet, est_respo_fab, est_finition, est_manutention, est_bureau_etude")
        .in("id", profileIds);
      profileMap = (profs ?? []).reduce<Record<string, ProfileFabRow>>((acc, p) => {
        acc[p.id] = p as ProfileFabRow;
        return acc;
      }, {});
    }
    setRows(
      (emps ?? []).map((e) => {
        const permis = (e as unknown as { categories_permis?: Permis[] | null }).categories_permis;
        const prof = e.profile_id ? profileMap[e.profile_id] : undefined;
        return {
          ...e,
          categories_permis: (permis ?? []) as Permis[],
          secondaires: secMap[e.id] ?? [],
          matricule_silae: prof?.matricule_silae ?? null,
          est_chef_projet: prof?.est_chef_projet ?? false,
          est_respo_fab: prof?.est_respo_fab ?? false,
          est_finition: prof?.est_finition ?? false,
          est_manutention: prof?.est_manutention ?? false,
          est_bureau_etude: prof?.est_bureau_etude ?? false,
        };
      }),
    );
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
      // Métier principal : OR cumulatif (au moins l'un des sélectionnés)
      if (filterMetierPrincipal.size > 0 && !filterMetierPrincipal.has(r.metier_principal_id)) return false;
      // Compétences secondaires : OR cumulatif sur la liste des secondaires (hors principal)
      if (filterMetierSecondaire.size > 0) {
        const sec = r.secondaires.filter((id) => id !== r.metier_principal_id);
        if (!sec.some((id) => filterMetierSecondaire.has(id))) return false;
      }
      if (!q) return true;
      const hay = `${r.prenom} ${r.nom} ${r.email ?? ""} ${r.agence_interim ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, filterContrat, filterActif, filterMetierPrincipal, filterMetierSecondaire]);

  const spreadsheetRows: SpreadsheetRow[] = useMemo(
    () => filtered.map((r) => ({
      id: r.id, prenom: r.prenom, nom: r.nom, email: r.email,
      telephone: r.telephone, mobile: r.mobile, type_contrat: r.type_contrat,
      sous_type_contrat: r.sous_type_contrat, agence_interim: r.agence_interim,
      metier_principal_id: r.metier_principal_id, actif: r.actif, non_staffing: r.non_staffing,
      est_livreur: r.est_livreur,
      categories_permis: r.categories_permis,
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
      est_livreur: row.est_livreur,
      categories_permis: row.categories_permis ?? [],
      date_naissance: row.date_naissance ?? "",
      adresse: row.adresse ?? "",
      notes: row.notes ?? "",
      matricule_silae: row.matricule_silae ?? "",
      profile_id: row.profile_id,
      est_chef_projet: row.est_chef_projet,
      est_respo_fab: row.est_respo_fab,
      est_finition: row.est_finition,
      est_manutention: row.est_manutention,
      est_bureau_etude: row.est_bureau_etude,
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
      est_livreur: form.est_livreur,
      categories_permis: form.est_livreur ? form.categories_permis : [],
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

    // Matricule SILAE + flags rôles fabrication : update sur profiles si lié et admin
    if (form.profile_id && isAdmin) {
      const newMat = form.matricule_silae.trim() || null;
      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          matricule_silae: newMat,
          est_chef_projet: form.est_chef_projet,
          est_respo_fab: form.est_respo_fab,
          est_finition: form.est_finition,
          est_manutention: form.est_manutention,
          est_bureau_etude: form.est_bureau_etude,
        })
        .eq("id", form.profile_id);
      if (profErr) {
        toast.error("Profil non sauvegardé", { description: profErr.message });
      }
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
              <TabsTrigger value="Apprenti" className="rounded-lg">Apprentis</TabsTrigger>
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
          <MultiFilter
            label="Métier principal"
            options={metiers.map((m) => ({ id: m.id, label: m.libelle, color: m.couleur }))}
            selected={filterMetierPrincipal}
            onChange={setFilterMetierPrincipal}
          />
          <MultiFilter
            label="Compétences"
            options={metiers.map((m) => ({ id: m.id, label: m.libelle, color: m.couleur }))}
            selected={filterMetierSecondaire}
            onChange={setFilterMetierSecondaire}
          />
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
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
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
                      <ContratPill type={r.type_contrat} agence={r.agence_interim} isApprenti={r.is_apprenti} />
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
                      {isAdminOrChef ? (
                        <button
                          type="button"
                          onClick={() => toggleActif(r)}
                          disabled={togglingId === r.id}
                          title={r.actif ? "Cliquer pour archiver" : "Cliquer pour réactiver"}
                          className={
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors disabled:opacity-50 " +
                            (r.actif
                              ? "bg-success/15 text-success hover:bg-success/25"
                              : "bg-muted text-muted-foreground hover:bg-muted/70")
                          }
                        >
                          {togglingId === r.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <span className={"h-1.5 w-1.5 rounded-full " + (r.actif ? "bg-success" : "bg-muted-foreground")} />
                          )}
                          {r.actif ? "Actif" : "Inactif"}
                        </button>
                      ) : (
                        r.actif
                          ? <span className="text-xs font-semibold text-success">Actif</span>
                          : <span className="text-xs font-semibold text-muted-foreground">Inactif</span>
                      )}
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
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{form.id ? "Modifier l'employé" : "Nouvel employé"}</DialogTitle>
            <DialogDescription>
              Renseignez les informations de la fiche. Les compétences secondaires permettent de proposer cet employé sur d'autres métiers que son métier principal.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 overflow-y-auto px-6 py-4 sm:grid-cols-2">
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
              <Label>
                Matricule SILAE
                {!isAdmin && <span className="ml-2 text-[10px] font-normal text-muted-foreground">(admin uniquement)</span>}
                {!form.profile_id && <span className="ml-2 text-[10px] font-normal text-muted-foreground">(employé non lié à un compte)</span>}
              </Label>
              <Input
                value={form.matricule_silae}
                onChange={(e) => setForm({ ...form, matricule_silae: e.target.value })}
                placeholder="Ex. 00123"
                disabled={!isAdmin || !form.profile_id}
                className="h-10 rounded-xl font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Clé de jointure pour l'export paie SILAE/PROGBAT.
              </p>
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
                <p className="text-sm font-semibold text-foreground">Apprenti</p>
                <p className="text-xs text-muted-foreground">Identifie les CDI en contrat d'apprentissage.</p>
              </div>
              <Switch
                checked={form.is_apprenti}
                disabled={form.type_contrat !== "CDI"}
                onCheckedChange={(v) => setForm({ ...form, is_apprenti: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3 sm:col-span-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Employé actif</p>
                <p className="text-xs text-muted-foreground">Décocher pour archiver sans supprimer.</p>
              </div>
              <Switch checked={form.actif} onCheckedChange={(v) => setForm({ ...form, actif: v })} />
            </div>

            {/* v0.18.1 — Bloc 3 : Capacités / Permis */}
            <div className="space-y-2 rounded-xl border border-border bg-background p-3 sm:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Livreur / Chauffeur</p>
                  <p className="text-xs text-muted-foreground">
                    Active si l'employé peut être affecté à un véhicule (planning Flotte).
                  </p>
                </div>
                <Switch
                  checked={form.est_livreur}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, est_livreur: v, categories_permis: v ? f.categories_permis : [] }))
                  }
                />
              </div>
              {form.est_livreur && (
                <div className="space-y-1.5 border-t border-border pt-2">
                  <Label className="text-xs">Catégories de permis détenues</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PERMIS_OPTIONS.map((opt) => {
                      const checked = form.categories_permis.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-xs"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const on = Boolean(v);
                              setForm((f) => ({
                                ...f,
                                categories_permis: on
                                  ? [...f.categories_permis, opt.value]
                                  : f.categories_permis.filter((p) => p !== opt.value),
                              }));
                            }}
                          />
                          <span className="font-medium">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Le permis détermine l'éligibilité du chauffeur sur les véhicules : B suffit pour VL/20m³, C ou CE obligatoires pour les poids lourds.
                  </p>
                </div>
              )}
            </div>

            {/* v0.20 — Bloc 2 : Rôles fabrication (indépendants du métier principal) */}
            <div className="space-y-2 rounded-xl border border-border bg-background p-3 sm:col-span-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Rôles fabrication</p>
                <p className="text-xs text-muted-foreground">
                  {form.profile_id
                    ? "Active les rôles atelier (indépendants du métier principal). Filtre les assignees dans le module Fabrication."
                    : "Disponible uniquement pour les employés liés à un compte utilisateur."}
                  {!isAdmin && form.profile_id && " Lecture seule (admin requis pour modifier)."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {([
                  { key: "est_chef_projet", label: "Chef projet" },
                  { key: "est_bureau_etude", label: "Bureau d'étude" },
                  { key: "est_respo_fab", label: "Respo Fab" },
                  { key: "est_finition", label: "Finition" },
                  { key: "est_manutention", label: "Manutention" },
                ] as const).map((flag) => (
                  <label
                    key={flag.key}
                    className={`flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-xs ${
                      !form.profile_id || !isAdmin ? "opacity-60" : ""
                    }`}
                  >
                    <Checkbox
                      checked={form[flag.key]}
                      disabled={!form.profile_id || !isAdmin}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, [flag.key]: Boolean(v) }))}
                    />
                    <span className="font-medium">{flag.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
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

function ContratPill({ type, agence, isApprenti }: { type: ContratType; agence: string | null; isApprenti?: boolean }) {
  if (type === "CDI") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-[var(--indigo-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
          CDI
        </span>
        {isApprenti && (
          <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning-foreground">
            Apprenti
          </span>
        )}
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
