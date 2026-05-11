/**
 * Tour 2 — /staffer-mobile : module staffing simplifié mobile-first.
 * Recherche personne + chantier, dates, slot 4h/8h, conflit dispo, contrat auto si éligible.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle, CheckCircle2, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { normalizeForMatch as normalize } from "@/lib/string-normalize";
import { generateContratV1 } from "@/lib/contrats-signature";

export const Route = createFileRoute("/_app/staffer-mobile")({
  component: () => (
    <RoleGuard required="chef_or_admin">
      <StafferMobile />
    </RoleGuard>
  ),
});

interface EmployeOption {
  id: string;
  nom: string;
  prenom: string;
  metier_principal_id: number;
  statut_contrat: string | null;
  type_contrat: string;
}

interface ChantierOption {
  id: string;
  numero: string;
  nom: string;
  lieu: string | null;
}

interface MetierOption {
  id: number;
  libelle: string;
}

function StafferMobile() {
  const [searchEmploye, setSearchEmploye] = useState("");
  const [searchChantier, setSearchChantier] = useState("");
  const [employeId, setEmployeId] = useState<string | null>(null);
  const [chantierId, setChantierId] = useState<string | null>(null);
  const [metierId, setMetierId] = useState<number | null>(null);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [slot, setSlot] = useState<"matin" | "apres_midi" | "journee">("journee");
  const [submitting, setSubmitting] = useState(false);

  // Fetch options
  const employesQuery = useQuery({
    queryKey: ["staffer-mobile-employes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employes")
        .select("id, nom, prenom, metier_principal_id, statut_contrat, type_contrat")
        .order("nom");
      if (error) throw error;
      return data as EmployeOption[];
    },
  });

  const chantiersQuery = useQuery({
    queryKey: ["staffer-mobile-chantiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affaires")
        .select("id, numero, nom, lieu")
        .neq("statut", "termine")
        .neq("statut", "annule")
        .order("numero", { ascending: false });
      if (error) throw error;
      return data as ChantierOption[];
    },
  });

  const metiersQuery = useQuery({
    queryKey: ["staffer-mobile-metiers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("metiers").select("id, libelle").order("ordre");
      if (error) throw error;
      return data as MetierOption[];
    },
  });

  const filteredEmployes = useMemo(() => {
    const q = normalize(searchEmploye);
    if (!q) return employesQuery.data?.slice(0, 8) ?? [];
    return (employesQuery.data ?? [])
      .filter((e) => normalize(`${e.prenom} ${e.nom}`).includes(q))
      .slice(0, 8);
  }, [employesQuery.data, searchEmploye]);

  const filteredChantiers = useMemo(() => {
    const q = normalize(searchChantier);
    if (!q) return chantiersQuery.data?.slice(0, 8) ?? [];
    return (chantiersQuery.data ?? [])
      .filter((c) => normalize(`${c.numero} ${c.nom}`).includes(q))
      .slice(0, 8);
  }, [chantiersQuery.data, searchChantier]);

  const employe = employesQuery.data?.find((e) => e.id === employeId) ?? null;
  const chantier = chantiersQuery.data?.find((c) => c.id === chantierId) ?? null;

  // Auto-set métier au choix de l'employé
  useEffect(() => {
    if (employe && metierId == null) setMetierId(employe.metier_principal_id);
  }, [employe, metierId]);

  // Conflit dispo : check absences validées + assignations existantes
  const conflictQuery = useQuery({
    queryKey: ["staffer-mobile-conflict", employeId, dateDebut, dateFin],
    enabled: !!employeId && !!dateDebut && !!dateFin && dateDebut <= dateFin,
    queryFn: async () => {
      const [{ data: absences }, { data: assigs }] = await Promise.all([
        supabase
          .from("absences")
          .select("date_debut, date_fin, type, valide")
          .eq("employe_id", employeId!)
          .eq("valide", true)
          .lte("date_debut", dateFin)
          .gte("date_fin", dateDebut),
        supabase
          .from("assignations")
          .select("date, demi_journee, affaire_id")
          .eq("employe_id", employeId!)
          .gte("date", dateDebut)
          .lte("date", dateFin),
      ]);
      return {
        absences: absences ?? [],
        assignations: assigs ?? [],
      };
    },
  });

  const hasConflict = (conflictQuery.data?.absences.length ?? 0) > 0
    || (conflictQuery.data?.assignations.length ?? 0) > 0;

  const eligibleContrat = employe
    ? ["CDDU intermittent", "CDD chantier", "Intermittent"].includes(employe.statut_contrat ?? "")
    : false;

  const canSubmit = !!employeId && !!chantierId && !!metierId && !!dateDebut && !!dateFin && dateDebut <= dateFin && !submitting;

  const reset = () => {
    setEmployeId(null);
    setChantierId(null);
    setMetierId(null);
    setSearchEmploye("");
    setSearchChantier("");
    setDateDebut("");
    setDateFin("");
    setSlot("journee");
  };

  const handleSubmit = async () => {
    if (!canSubmit || !employeId || !chantierId || !metierId) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("staffer_mobile_create_mission", {
        _employee_id: employeId,
        _chantier_id: chantierId,
        _metier_id: metierId,
        _date_debut: dateDebut,
        _date_fin: dateFin,
        _slot: slot,
      });
      if (error) throw new Error(error.message);
      const result = data as { assignations_count: number; contrat_id: string | null; requires_contract: boolean };

      // Si contrat créé, génère le PDF v1 disponible dans l'app employé
      if (result.contrat_id) {
        try {
          await generateContratV1(result.contrat_id);
        } catch (e) {
          console.warn("Génération PDF échec (mission OK):", e);
        }
      }

      toast.success(
        result.contrat_id
          ? `${result.assignations_count} demi-journée(s) staffée(s) + contrat disponible à signer`
          : `${result.assignations_count} demi-journée(s) staffée(s)`,
      );
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du staffing");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <PageHeader title="Staffer rapide" description="Affectation mobile + contrat intermittent auto" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personne</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Rechercher un employé…"
            value={searchEmploye}
            onChange={(e) => setSearchEmploye(e.target.value)}
            disabled={!!employeId}
          />
          {!employeId && filteredEmployes.length > 0 && (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {filteredEmployes.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setEmployeId(e.id)}
                    className="w-full text-left rounded-md border px-3 py-2 text-sm hover:bg-accent flex items-center justify-between"
                  >
                    <span>{e.prenom} {e.nom}</span>
                    {e.statut_contrat && <Badge variant="outline" className="text-[10px]">{e.statut_contrat}</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {employe && (
            <div className="flex items-center justify-between rounded-md bg-accent/30 px-3 py-2 text-sm">
              <span className="font-semibold">{employe.prenom} {employe.nom}</span>
              <Button variant="ghost" size="sm" onClick={() => { setEmployeId(null); setMetierId(null); }}>Changer</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Chantier</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="N° ou nom de chantier…"
            value={searchChantier}
            onChange={(e) => setSearchChantier(e.target.value)}
            disabled={!!chantierId}
          />
          {!chantierId && filteredChantiers.length > 0 && (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {filteredChantiers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setChantierId(c.id)}
                    className="w-full text-left rounded-md border px-3 py-2 text-sm hover:bg-accent"
                  >
                    <div className="font-mono text-xs text-muted-foreground">{c.numero}</div>
                    <div className="font-semibold">{c.nom}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {chantier && (
            <div className="flex items-center justify-between rounded-md bg-accent/30 px-3 py-2 text-sm">
              <span><span className="font-mono text-xs text-muted-foreground">{chantier.numero}</span> · <span className="font-semibold">{chantier.nom}</span></span>
              <Button variant="ghost" size="sm" onClick={() => setChantierId(null)}>Changer</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Période & métier</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dd">Du</Label>
              <Input id="dd" type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="df">Au</Label>
              <Input id="df" type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Créneau</Label>
            <Select value={slot} onValueChange={(v) => setSlot(v as typeof slot)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="journee">Journée complète (8 h)</SelectItem>
                <SelectItem value="matin">½ journée matin (4 h)</SelectItem>
                <SelectItem value="apres_midi">½ journée après-midi (4 h)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Métier</Label>
            <Select value={metierId?.toString() ?? ""} onValueChange={(v) => setMetierId(parseInt(v, 10))}>
              <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
              <SelectContent>
                {metiersQuery.data?.map((m) => (
                  <SelectItem key={m.id} value={m.id.toString()}>{m.libelle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {hasConflict && (
        <Alert variant="default" className="border-amber-500/50 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm">
            <strong>Conflit dispo détecté :</strong>{" "}
            {(conflictQuery.data?.absences.length ?? 0) > 0 && `${conflictQuery.data?.absences.length} absence(s) validée(s) sur la période. `}
            {(conflictQuery.data?.assignations.length ?? 0) > 0 && `${conflictQuery.data?.assignations.length} affectation(s) déjà existante(s). `}
            Les jours en conflit seront ignorés automatiquement.
          </AlertDescription>
        </Alert>
      )}

      {eligibleContrat && (
        <Alert className="border-primary/50 bg-primary/5">
          <FileSignature className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Ce salarié est <strong>{employe?.statut_contrat}</strong> — un contrat sera généré et envoyé pour signature électronique.
          </AlertDescription>
        </Alert>
      )}

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 backdrop-blur p-4">
        <Button onClick={handleSubmit} disabled={!canSubmit} size="lg" className="w-full">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Confirmer le staffing
        </Button>
      </div>
    </div>
  );
}
