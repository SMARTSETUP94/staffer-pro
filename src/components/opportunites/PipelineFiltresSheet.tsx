import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";
import { TRI_LABEL, type TriCartes } from "@/lib/pipeline-kanban";
import { PERIODE_LABEL, STATUT_DEVIS_FILTRE_LABEL, type FiltresAvances, type PeriodeFiltre, type StatutDevisFiltre } from "@/lib/pipeline-filtres";
import type { ReactNode } from "react";

export type Interrupteurs = { actionsDues: boolean; noCa: boolean; noD: boolean; noRp: boolean; claude: boolean };

type Props = {
  open: boolean; onOpenChange: (o: boolean) => void;
  q: string; setQ: (v: string) => void;
  tri: TriCartes; setTri: (t: TriCartes) => void; showTri: boolean;
  ca: string; setCa: (v: string) => void; charges: { id: string; full_name?: string | null; email?: string | null }[]; moiId?: string;
  inter: Interrupteurs; setInter: (k: keyof Interrupteurs, v: boolean) => void; showScopeAll: boolean; claudeNb: number;
  f: FiltresAvances; setF: (f: FiltresAvances) => void;
  typologies: { value: string; label: string }[]; tailles: { value: string; label: string }[];
  nbResultats: number; onReset: () => void;
};

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{titre}</div>
      {children}
    </div>
  );
}
function Puces<T extends string>({ items, actifs, onChange }: { items: { value: T; label: string }[]; actifs: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const on = actifs.includes(it.value);
        return (
          <button key={it.value} type="button" aria-pressed={on}
            onClick={() => onChange(on ? actifs.filter((x) => x !== it.value) : [...actifs, it.value])}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
function Inter({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm" title={title}>
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

export function PipelineFiltresSheet(p: Props) {
  const isMobile = useIsMobile();
  const f = p.f;
  const set = (patch: Partial<FiltresAvances>) => p.setF({ ...f, ...patch });
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", ".")) || 0);
  return (
    <Sheet open={p.open} onOpenChange={p.onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={`flex flex-col gap-0 p-0 ${isMobile ? "max-h-[90vh] rounded-t-2xl" : "w-full sm:max-w-md"}`}>
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>Filtres</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <Section titre="Recherche">
            <div className="relative">
              <Input value={p.q} onChange={(e) => p.setQ(e.target.value)} placeholder="N° chantier, client ou nom…" className="h-10 rounded-xl pr-8" aria-label="Recherche" />
              {p.q && <button onClick={() => p.setQ("")} aria-label="Effacer la recherche" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}
            </div>
          </Section>
          {p.showTri && (
            <Section titre="Tri des cartes">
              <Puces items={(Object.keys(TRI_LABEL) as TriCartes[]).map((t) => ({ value: t, label: TRI_LABEL[t] }))} actifs={[p.tri]} onChange={(v) => v.length && p.setTri(v[v.length - 1])} />
            </Section>
          )}
          <Section titre="Chargé d'affaires">
            <Select value={p.ca} onValueChange={p.setCa}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous les chargés d'affaires</SelectItem>
                {p.moiId && <SelectItem value={p.moiId}>Moi</SelectItem>}
                {p.charges.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </Section>
          <Section titre="Raccourcis">
            <div className="divide-y divide-border rounded-xl border border-border px-3">
              <Inter label="Actions dues ≤ 7 j" checked={p.inter.actionsDues} onChange={(v) => p.setInter("actionsDues", v)} />
              {p.showScopeAll && <Inter label="Sans chargé d'affaires" checked={p.inter.noCa} onChange={(v) => p.setInter("noCa", v)} />}
              {p.showScopeAll && <Inter label="Sans dessinateur" title="Statuts À l'étude, Presque gagné et Gagné" checked={p.inter.noD} onChange={(v) => p.setInter("noD", v)} />}
              {p.showScopeAll && <Inter label="Sans responsable projet" title="Statuts Presque gagné et Gagné" checked={p.inter.noRp} onChange={(v) => p.setInter("noRp", v)} />}
              <Inter label={`Brouillon Claude à relire${p.claudeNb ? ` (${p.claudeNb})` : ""}`} checked={p.inter.claude} onChange={(v) => p.setInter("claude", v)} />
              <Inter label="En retard" checked={f.enRetard} onChange={(v) => set({ enRetard: v })} />
              <Inter label="Sans date de montage" checked={f.sansDateMontage} onChange={(v) => set({ sansDateMontage: v })} />
              <Inter label="Suppléments de chantiers 6XXX uniquement" checked={f.supplements} onChange={(v) => set({ supplements: v })} />
            </div>
          </Section>
          <Section titre="Statut du devis">
            <Puces items={(Object.keys(STATUT_DEVIS_FILTRE_LABEL) as StatutDevisFiltre[]).map((s) => ({ value: s, label: STATUT_DEVIS_FILTRE_LABEL[s] }))} actifs={f.statutsDevis} onChange={(v) => set({ statutsDevis: v })} />
          </Section>
          <Section titre="Typologie future">
            <Puces items={p.typologies} actifs={f.typologies} onChange={(v) => set({ typologies: v })} />
          </Section>
          <Section titre="Taille">
            <Puces items={p.tailles} actifs={f.tailles} onChange={(v) => set({ tailles: v })} />
          </Section>
          <Section titre="Période de montage ou d'événement">
            <Puces items={(Object.keys(PERIODE_LABEL) as Exclude<PeriodeFiltre, "">[]).map((k) => ({ value: k, label: PERIODE_LABEL[k] }))} actifs={f.periode ? [f.periode] : []} onChange={(v) => set({ periode: (v.filter((x) => x !== f.periode)[0] ?? "") as PeriodeFiltre })} />
            {f.periode === "libre" && (
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={f.du} onChange={(e) => set({ du: e.target.value })} aria-label="Du" className="h-10 rounded-xl" />
                <Input type="date" value={f.au} onChange={(e) => set({ au: e.target.value })} aria-label="Au" className="h-10 rounded-xl" />
              </div>
            )}
          </Section>
          <Section titre="Montant HT (€)">
            <div className="grid grid-cols-2 gap-2">
              <Input inputMode="numeric" placeholder="Minimum" value={f.montantMin ?? ""} onChange={(e) => set({ montantMin: num(e.target.value) })} className="h-10 rounded-xl tabular-nums" aria-label="Montant minimum" />
              <Input inputMode="numeric" placeholder="Maximum" value={f.montantMax ?? ""} onChange={(e) => set({ montantMax: num(e.target.value) })} className="h-10 rounded-xl tabular-nums" aria-label="Montant maximum" />
            </div>
          </Section>
          <Section titre="Client">
            <Input value={f.client} onChange={(e) => set({ client: e.target.value })} placeholder="Nom du client…" className="h-10 rounded-xl" aria-label="Client" />
          </Section>
        </div>
        <SheetFooter className="flex-row gap-2 border-t border-border px-5 py-3 sm:justify-between">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={p.onReset}>Réinitialiser</Button>
          <Button className="flex-1 rounded-xl" onClick={() => p.onOpenChange(false)}>
            Afficher {p.nbResultats} opportunité{p.nbResultats > 1 ? "s" : ""}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
