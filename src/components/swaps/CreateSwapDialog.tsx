import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeftRight, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface Assignation {
  id: string;
  date: string;
  demi_journee: string;
  heures: number;
  metier_id: number;
  affaire: { numero: string; nom: string } | null;
  metier: { libelle: string; couleur: string } | null;
}

interface Collegue {
  id: string;
  prenom: string;
  nom: string;
  metier_principal_id: number;
  metiers_secondaires: number[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Assignations futures de l'employé courant */
  myAssignations: Assignation[];
  /** ID de l'employé courant */
  currentEmployeId: string;
  onCreated: () => void;
}

export function CreateSwapDialog({ open, onOpenChange, myAssignations, currentEmployeId, onCreated }: Props) {
  const [type, setType] = useState<"delegation" | "echange">("echange");
  const [fromAssignationId, setFromAssignationId] = useState<string>("");
  const [toEmployeId, setToEmployeId] = useState<string>("");
  const [toAssignationId, setToAssignationId] = useState<string>("");
  const [motif, setMotif] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [collegues, setCollegues] = useState<Collegue[]>([]);
  const [collegueAssignations, setCollegueAssignations] = useState<Assignation[]>([]);
  const [loadingCollegues, setLoadingCollegues] = useState(false);

  // Reset à l'ouverture
  useEffect(() => {
    if (open) {
      setType("echange");
      setFromAssignationId("");
      setToEmployeId("");
      setToAssignationId("");
      setMotif("");
    }
  }, [open]);

  const fromAssignation = useMemo(
    () => myAssignations.find((a) => a.id === fromAssignationId) ?? null,
    [myAssignations, fromAssignationId],
  );

  // Charger les collègues compatibles métier dès qu'un créneau source est sélectionné
  useEffect(() => {
    if (!fromAssignation) {
      setCollegues([]);
      return;
    }
    setLoadingCollegues(true);
    const requiredMetier = fromAssignation.metier_id;
    Promise.all([
      supabase
        .from("employes")
        .select("id, prenom, nom, metier_principal_id")
        .eq("actif", true)
        .eq("non_staffing", false)
        .neq("id", currentEmployeId),
      supabase.from("employe_metiers").select("employe_id, metier_id"),
    ]).then(([eRes, mRes]) => {
      if (eRes.error || mRes.error) {
        toast.error(eRes.error?.message ?? mRes.error?.message ?? "Erreur");
        setLoadingCollegues(false);
        return;
      }
      const secByEmp = new Map<string, number[]>();
      (mRes.data ?? []).forEach((row) => {
        const arr = secByEmp.get(row.employe_id) ?? [];
        arr.push(row.metier_id);
        secByEmp.set(row.employe_id, arr);
      });
      const enriched: Collegue[] = (eRes.data ?? []).map((e) => ({
        ...e,
        metiers_secondaires: secByEmp.get(e.id) ?? [],
      }));
      // Filtre métier-compatibles
      const filtered = enriched.filter(
        (e) =>
          e.metier_principal_id === requiredMetier ||
          e.metiers_secondaires.includes(requiredMetier),
      );
      setCollegues(filtered);
      setLoadingCollegues(false);
    });
  }, [fromAssignation, currentEmployeId]);

  // Charger les assignations futures du collègue choisi (pour échange bidirectionnel)
  useEffect(() => {
    if (!toEmployeId || type !== "echange") {
      setCollegueAssignations([]);
      return;
    }
    const today = format(new Date(), "yyyy-MM-dd");
    supabase
      .from("assignations")
      .select(
        "id, date, demi_journee, heures, metier_id, affaire:affaires(numero, nom), metier:metiers(libelle, couleur)",
      )
      .eq("employe_id", toEmployeId)
      .gte("date", today)
      .order("date")
      .limit(50)
      .then(({ data, error }) => {
        if (error) {
          toast.error(error.message);
          return;
        }
        setCollegueAssignations((data ?? []) as unknown as Assignation[]);
      });
  }, [toEmployeId, type]);

  const submit = async () => {
    if (!fromAssignationId || !toEmployeId) {
      toast.error("Sélectionne un créneau et un collègue.");
      return;
    }
    if (type === "echange" && !toAssignationId) {
      toast.error("Sélectionne le créneau du collègue à échanger.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("swap_requests").insert({
      type,
      from_employe_id: currentEmployeId,
      from_assignation_id: fromAssignationId,
      to_employe_id: toEmployeId,
      to_assignation_id: type === "echange" ? toAssignationId : null,
      motif_demande: motif.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Demande envoyée au collègue.");
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Proposer un échange ou une délégation</DialogTitle>
          <DialogDescription>
            Choisis un créneau, le collègue compatible et ajoute un motif si besoin.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={type} onValueChange={(v) => setType(v as "delegation" | "echange")}>
          <TabsList>
            <TabsTrigger value="echange" className="gap-1">
              <ArrowLeftRight className="h-3.5 w-3.5" /> Échange bidirectionnel
            </TabsTrigger>
            <TabsTrigger value="delegation" className="gap-1">
              <ArrowRight className="h-3.5 w-3.5" /> Délégation simple
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Mon créneau</Label>
            <Select value={fromAssignationId} onValueChange={setFromAssignationId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choisir un créneau…" />
              </SelectTrigger>
              <SelectContent>
                {myAssignations.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">Aucune assignation à venir.</div>
                ) : (
                  myAssignations.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {format(new Date(a.date), "EEE d MMM", { locale: fr })} · {a.demi_journee} · {a.affaire?.numero} ({a.metier?.libelle})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">
              Collègue cible (filtré sur le métier requis)
              {loadingCollegues && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
            </Label>
            <Select value={toEmployeId} onValueChange={setToEmployeId} disabled={!fromAssignation}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={fromAssignation ? "Choisir un collègue…" : "Choisis d'abord un créneau"} />
              </SelectTrigger>
              <SelectContent>
                {collegues.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">
                    {fromAssignation ? "Aucun collègue compatible." : "—"}
                  </div>
                ) : (
                  collegues.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.prenom} {c.nom}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {type === "echange" && toEmployeId && (
            <div>
              <Label className="text-xs">Créneau à recevoir du collègue</Label>
              <Select value={toAssignationId} onValueChange={setToAssignationId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choisir un créneau…" />
                </SelectTrigger>
                <SelectContent>
                  {collegueAssignations.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      Le collègue n'a pas d'assignation à venir.
                    </div>
                  ) : (
                    collegueAssignations.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {format(new Date(a.date), "EEE d MMM", { locale: fr })} · {a.demi_journee} · {a.affaire?.numero} ({a.metier?.libelle})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Motif (optionnel)</Label>
            <Textarea
              rows={2}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Ex : rdv médical, contrainte personnelle…"
            />
          </div>

          {type === "delegation" && (
            <div className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-400">
              <Badge variant="outline" className="mr-1">Délégation</Badge>
              Tu donnes ton créneau à ton collègue sans recevoir de contrepartie. Le chef devra valider.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Envoyer la demande
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
