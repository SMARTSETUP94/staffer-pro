/**
 * Lot 8.3b — Dialog d'ajout manuel d'un employé sur un métier d'un objet.
 *
 * Sélectionne dans la liste rankée par `listCandidatsForMetier`, présente un
 * slider de présence (10 → 100 %, step 10) et appelle `assignManualToObjet`.
 * Les warnings de cumul > 100 % sont affichés en banner non bloquant.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Search, Star } from "lucide-react";
import { toast } from "sonner";
import {
  assignManualToObjet,
  listCandidatsForMetier,
} from "@/server/objet-equipe-mutations.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objetId: string;
  metierId: number;
  metierLabel: string;
}

const TIER_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: "Principal",
  2: "Secondaire",
  3: "Polyvalent",
  4: "Hors métier",
};
const TIER_TONE: Record<1 | 2 | 3 | 4, string> = {
  1: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  2: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  3: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  4: "border-muted bg-muted text-muted-foreground",
};

export function AddPersonneDialog({
  open,
  onOpenChange,
  objetId,
  metierId,
  metierLabel,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presence, setPresence] = useState(100);
  const qc = useQueryClient();

  const fetchCandidats = useServerFn(listCandidatsForMetier);
  const assignMutation = useServerFn(assignManualToObjet);

  const { data: candidats, isLoading } = useQuery({
    queryKey: ["objet-candidats", metierId],
    queryFn: () => fetchCandidats({ data: { metierId } }),
    enabled: open,
  });

  const filtered = useMemo(() => {
    if (!candidats) return [];
    const q = search.trim().toLowerCase();
    if (!q) return candidats;
    return candidats.filter(
      (c) =>
        c.nom.toLowerCase().includes(q) || c.prenom.toLowerCase().includes(q)
    );
  }, [candidats, search]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Sélectionnez un employé");
      return assignMutation({
        data: { objetId, employeId: selectedId, metierId, presencePct: presence },
      });
    },
    onSuccess: (res) => {
      if (res.status === "no_plan") {
        toast.error("Aucun plan publié sur cet objet.");
        return;
      }
      if (res.status === "already_assigned") {
        toast.warning("Cet employé est déjà assigné sur toute la fenêtre.");
        return;
      }
      const cumulMsg =
        res.warning_cumul && res.warning_cumul.length > 0
          ? ` · ⚠️ ${res.warning_cumul.length} jour(s) en cumul > 100 %`
          : "";
      toast.success(`${res.inserted} jour(s) ajouté(s)${cumulMsg}`);
      qc.invalidateQueries({ queryKey: ["objet-equipe", objetId] });
      qc.invalidateQueries({ queryKey: ["fiche-objet", objetId] });
      onOpenChange(false);
      setSelectedId(null);
      setSearch("");
      setPresence(100);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une personne — {metierLabel}</DialogTitle>
          <DialogDescription>
            L'employé sera ajouté sur toute la fenêtre couverte par les steps de
            ce métier sur l'objet. Les jours déjà assignés sont ignorés.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un employé..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>

          <ScrollArea className="h-64 rounded-md border">
            {isLoading && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Chargement...
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Aucun candidat.
              </p>
            )}
            {!isLoading && (
              <ul className="divide-y">
                {filtered.map((c) => {
                  const selected = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                          selected ? "bg-accent" : ""
                        }`}
                        data-testid={`candidat-${c.id}`}
                      >
                        <span className="flex items-center gap-2">
                          {c.is_principal && (
                            <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                          )}
                          <span className="font-medium">
                            {c.prenom} {c.nom}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {c.type_contrat}
                          </span>
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${TIER_TONE[c.tier]}`}
                        >
                          {TIER_LABEL[c.tier]}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>

          {selectedId && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Présence quotidienne</label>
                <Badge variant="outline" className="font-mono">
                  {presence} %
                </Badge>
              </div>
              <Slider
                value={[presence]}
                onValueChange={(v) => setPresence(v[0])}
                min={10}
                max={100}
                step={10}
              />
              {presence < 100 && (
                <Alert className="border-amber-500/40 bg-amber-500/5 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  <AlertDescription className="text-xs">
                    Présence partielle : l'employé pourra être affecté ailleurs
                    le même jour.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!selectedId || mutation.isPending}
            data-testid="add-personne-confirm"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
