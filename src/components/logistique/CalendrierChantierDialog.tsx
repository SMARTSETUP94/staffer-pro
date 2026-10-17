import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, ChevronsUpDown, Clock, MapPin, Pencil, Plus, Truck, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAffairesPourLogistique, useEtapesAffaire, type EtapeLogistique } from "@/hooks/use-etapes-logistiques";
import { useCapability } from "@/hooks/use-capability";
import { calendrierChantier, ETAPE_CLASSES, ETAPE_LABELS, heureCourte, nbPersonnesCourt } from "@/lib/logistique/etapes";
import { cn } from "@/lib/utils";
import { EtapeDialog } from "./EtapeDialog";

type AffaireOption = { id: string; numero: string; nom: string };

export function CalendrierChantierDialog({ open, onOpenChange, etapes }: {
  open: boolean; onOpenChange: (open: boolean) => void; etapes: EtapeLogistique[];
}) {
  const { data: affaires = [] } = useAffairesPourLogistique();
  const [selected, setSelected] = useState<AffaireOption | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const options = useMemo(() => {
    const all = new Map<string, AffaireOption>(affaires.map((a) => [a.id, a]));
    for (const e of etapes) if (e.affaire) all.set(e.affaire.id, e.affaire);
    return [...all.values()].sort((a, b) => b.numero.localeCompare(a.numero));
  }, [affaires, etapes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onInteractOutside={(event) => event.preventDefault()} className="flex max-h-[90dvh] w-[calc(100%-2rem)] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle>Calendrier du chantier</DialogTitle>
          <DialogDescription>{selected ? `${selected.numero} — ${selected.nom}` : "Chantier / opportunité"}</DialogDescription>
        </DialogHeader>
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-label="Choisir le chantier du calendrier" aria-expanded={searchOpen} className="w-full justify-between font-normal">
              <span className="min-w-0 truncate">{selected ? `${selected.numero} — ${selected.nom}` : "Choisir un chantier…"}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
            <Command>
              <CommandInput placeholder="Rechercher par numéro ou mot clé…" />
              <CommandList>
                <CommandEmpty>Aucun chantier trouvé.</CommandEmpty>
                {options.map((a) => (
                  <CommandItem key={a.id} value={`${a.numero} ${a.nom}`} onSelect={() => { setSelected(a); setSearchOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", selected?.id === a.id ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 break-words">{a.numero} — {a.nom}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {open && selected && <CalendrierChantier key={selected.id} affaire={selected} />}
      </DialogContent>
    </Dialog>
  );
}

function CalendrierChantier({ affaire }: { affaire: AffaireOption }) {
  const { data: etapes = [], isLoading, error, refetch } = useEtapesAffaire(affaire.id);
  const canEdit = useCapability("logistique.etape.edit");
  const jours = useMemo(() => calendrierChantier(etapes, affaire.id), [etapes, affaire.id]);
  const [edit, setEdit] = useState<{ open: boolean; etape?: EtapeLogistique; date?: string }>({ open: false });
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <>
      <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{jours.length} jour(s) · {etapes.filter((e) => e.statut !== "annule").length} étape(s)</p>
          {canEdit && <Button size="sm" onClick={() => setEdit({ open: true, date: today })}><Plus className="mr-1 h-4 w-4" />Étape</Button>}
        </div>
        {isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p> : error ? (
          <div className="space-y-2 py-4"><p className="text-sm text-destructive">Impossible de charger le calendrier.</p><Button variant="outline" onClick={() => refetch()}>Réessayer</Button></div>
        ) : jours.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Aucune étape planifiée pour ce chantier.</p> : jours.map(({ date, etapes: rows }) => (
          <section key={date} aria-label={format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })} className="space-y-2">
            <h3 className={cn("border-b border-border pb-2 text-base font-semibold capitalize", date === today && "text-primary")}>{format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {rows.map((e) => {
                const horaires = [heureCourte(e.heure_debut), heureCourte(e.heure_fin)].filter(Boolean).join(" – ");
                const vehicule = e.vehicule?.immatriculation ?? e.vehicule?.nom ?? e.immatriculation_libre;
                return (
                  <article key={e.id} className="min-w-0 space-y-2 rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("rounded px-2 py-1 text-xs font-semibold", ETAPE_CLASSES[e.type])}>{ETAPE_LABELS[e.type]}{e.sens ? ` ${e.sens}` : ""}</span>
                      {canEdit && <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Modifier ${ETAPE_LABELS[e.type]} du ${date}`} title="Modifier l'étape" onClick={() => setEdit({ open: true, etape: e })}><Pencil className="h-4 w-4" /></Button>}
                    </div>
                    <div className="space-y-1 text-sm">
                      {horaires && <p className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 shrink-0" />{horaires}</p>}
                      {e.horaire_libre && <p className="break-words">{e.horaire_libre}</p>}
                      {e.lieu_libre && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 break-words">{e.lieu_libre}</span></p>}
                      {e.responsable && <p className="flex items-start gap-2"><User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 break-words">{e.responsable}</span></p>}
                      {nbPersonnesCourt(e.nb_personnes) && <p className="flex items-center gap-2"><Users className="h-4 w-4 shrink-0 text-muted-foreground" />{nbPersonnesCourt(e.nb_personnes)}</p>}
                      {vehicule && <p className="flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 break-words">{vehicule}</span></p>}
                      {e.acces && <p className="break-words text-muted-foreground">Accès : {e.acces}</p>}
                    </div>
                    {e.statut === "propose" && <p className="text-xs text-muted-foreground">Proposition à valider</p>}
                    {e.note && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{e.note}</p>}
                    {e.commentaire_equipe && <p className="whitespace-pre-wrap break-words border-t border-border pt-2 text-sm">{e.commentaire_equipe}</p>}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {canEdit && <EtapeDialog open={edit.open} onOpenChange={(open) => setEdit((p) => ({ ...p, open }))} etape={edit.etape} defaultDate={edit.date} defaultAffaireId={affaire.id} />}
    </>
  );
}