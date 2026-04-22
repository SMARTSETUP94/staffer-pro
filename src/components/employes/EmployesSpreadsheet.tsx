import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMetiers } from "@/hooks/use-metiers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type ContratType = "CDI" | "CDD" | "Interim" | "Independant";
type Permis = "B" | "C" | "CE" | "D";

const PERMIS_VALUES: Permis[] = ["B", "C", "CE", "D"];

export interface SpreadsheetRow {
  id: string;
  prenom: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  mobile: string | null;
  type_contrat: ContratType;
  sous_type_contrat: string | null;
  agence_interim: string | null;
  metier_principal_id: number;
  actif: boolean;
  non_staffing: boolean;
  est_livreur: boolean;
  categories_permis: Permis[];
}

interface Props {
  rows: SpreadsheetRow[];
  onSaved: () => void;
}

type DraftPatch = Partial<
  Pick<
    SpreadsheetRow,
    | "prenom"
    | "nom"
    | "email"
    | "telephone"
    | "mobile"
    | "type_contrat"
    | "sous_type_contrat"
    | "agence_interim"
    | "metier_principal_id"
    | "actif"
    | "non_staffing"
    | "est_livreur"
    | "categories_permis"
  >
>;

export function EmployesSpreadsheet({ rows, onSaved }: Props) {
  const { metiers } = useMetiers();
  const [drafts, setDrafts] = useState<Record<string, DraftPatch>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const setField = (id: string, patch: DraftPatch) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const cancel = (id: string) =>
    setDrafts((d) => {
      const { [id]: _omit, ...rest } = d;
      return rest;
    });

  const save = async (row: SpreadsheetRow) => {
    const patch = drafts[row.id];
    if (!patch) return;
    setSavingId(row.id);
    const payload: DraftPatch = { ...patch };
    if (payload.email !== undefined) payload.email = (payload.email || "").trim() || null;
    if (payload.telephone !== undefined) payload.telephone = (payload.telephone || "").trim() || null;
    if (payload.mobile !== undefined) payload.mobile = (payload.mobile || "").trim() || null;
    if (payload.agence_interim !== undefined)
      payload.agence_interim = (payload.agence_interim || "").trim() || null;
    if (payload.sous_type_contrat !== undefined)
      payload.sous_type_contrat = (payload.sous_type_contrat || "").trim() || null;
    const { error } = await supabase.from("employes").update(payload).eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast.error("Sauvegarde impossible", { description: error.message });
      return;
    }
    toast.success("Modifié");
    cancel(row.id);
    onSaved();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="max-h-[70vh] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead className="min-w-[140px]">Nom</TableHead>
              <TableHead className="min-w-[140px]">Prénom</TableHead>
              <TableHead className="min-w-[180px]">Email</TableHead>
              <TableHead className="min-w-[140px]">Mobile</TableHead>
              <TableHead className="min-w-[120px]">Contrat</TableHead>
              <TableHead className="min-w-[110px]">Sous-type</TableHead>
              <TableHead className="min-w-[140px]">Agence intérim</TableHead>
              <TableHead className="min-w-[180px]">Métier principal</TableHead>
              <TableHead className="w-[80px] text-center">Actif</TableHead>
              <TableHead className="w-[100px] text-center">Hors staffing</TableHead>
              <TableHead className="w-[80px] text-center">Livreur</TableHead>
              <TableHead className="min-w-[180px]">Permis</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const draft = drafts[row.id];
              const dirty = Boolean(draft);
              const v = <K extends keyof SpreadsheetRow>(k: K): SpreadsheetRow[K] =>
                (draft && k in draft ? (draft as Record<string, unknown>)[k as string] : row[k]) as SpreadsheetRow[K];
              return (
                <TableRow key={row.id} className={dirty ? "bg-warning-soft/30" : undefined}>
                  <TableCell>
                    <Input
                      value={(v("nom") as string) ?? ""}
                      onChange={(e) => setField(row.id, { nom: e.target.value })}
                      className="h-8 rounded-md text-sm font-semibold uppercase"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={(v("prenom") as string) ?? ""}
                      onChange={(e) => setField(row.id, { prenom: e.target.value })}
                      className="h-8 rounded-md text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="email"
                      value={(v("email") as string | null) ?? ""}
                      onChange={(e) => setField(row.id, { email: e.target.value })}
                      className="h-8 rounded-md text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={(v("mobile") as string | null) ?? ""}
                      onChange={(e) => setField(row.id, { mobile: e.target.value })}
                      className="h-8 rounded-md text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={v("type_contrat") as ContratType}
                      onValueChange={(val) => setField(row.id, { type_contrat: val as ContratType })}
                    >
                      <SelectTrigger className="h-8 rounded-md text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CDI">CDI</SelectItem>
                        <SelectItem value="CDD">CDD</SelectItem>
                        <SelectItem value="Interim">Intérim</SelectItem>
                        <SelectItem value="Independant">Indépendant</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={(v("sous_type_contrat") as string | null) ?? ""}
                      onChange={(e) => setField(row.id, { sous_type_contrat: e.target.value })}
                      placeholder="—"
                      className="h-8 rounded-md text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={(v("agence_interim") as string | null) ?? ""}
                      onChange={(e) => setField(row.id, { agence_interim: e.target.value })}
                      disabled={(v("type_contrat") as ContratType) !== "Interim"}
                      placeholder={(v("type_contrat") as ContratType) === "Interim" ? "Manpower…" : "—"}
                      className="h-8 rounded-md text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={String(v("metier_principal_id") as number)}
                      onValueChange={(val) => setField(row.id, { metier_principal_id: Number(val) })}
                    >
                      <SelectTrigger className="h-8 rounded-md text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {metiers.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.libelle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={v("actif") as boolean}
                      onCheckedChange={(val) => setField(row.id, { actif: val })}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={v("non_staffing") as boolean}
                      onCheckedChange={(val) => setField(row.id, { non_staffing: val })}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={v("est_livreur") as boolean}
                      onCheckedChange={(val) =>
                        setField(row.id, val ? { est_livreur: true } : { est_livreur: false, categories_permis: [] })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {(v("est_livreur") as boolean) ? (
                      <div className="flex flex-wrap gap-1">
                        {PERMIS_VALUES.map((p) => {
                          const current = (v("categories_permis") as Permis[] | null) ?? [];
                          const checked = current.includes(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => {
                                const next = checked
                                  ? current.filter((x) => x !== p)
                                  : [...current, p];
                                setField(row.id, { categories_permis: next });
                              }}
                              className={
                                "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors " +
                                (checked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-card text-muted-foreground hover:bg-muted")
                              }
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {dirty && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 rounded-md"
                          onClick={() => cancel(row.id)}
                          disabled={savingId === row.id}
                          title="Annuler"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          className="h-7 w-7 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={() => save(row)}
                          disabled={savingId === row.id}
                          title="Enregistrer"
                        >
                          {savingId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
