import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DevisStatutBadge } from "./DevisStatutBadge";
import { AvantValiderDialog } from "./editeur/AvantValiderDialog";
import { SignerOpportuniteDialog } from "@/components/opportunites/SignerOpportuniteDialog";
import type { TypologieFuture } from "@/lib/typologie-future";
import { EnregistrerTransfertDialog } from "./ProgbatTransfert";
import { STATUT_LABEL, devisKey, type DevisStatut, type DevisData } from "./editeur/api";
import { libelleStatutDevis } from "@/lib/devis/progbat-export";
import { grouperCharges, type ChoixCharge } from "@/lib/devis/entete-verrou";
import { actionsStatutListe, type ActionStatut } from "@/lib/devis/actions-liste";

export type DevisLigneAction = {
  id: string; numero: string; affaire_id: string; affaire_numero: string | null;
  statut_redaction: DevisStatut; numero_progbat: string | null; date_envoi: string | null;
  net_ht: number | null; charge_affaires_id: string | null; charge_affaires_nom: string | null;
};

function useRafraichirListe(id: string) {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["devis-staffing-global"] }),
      qc.invalidateQueries({ queryKey: devisKey(id) }),
      qc.invalidateQueries({ queryKey: ["devis-charge"] }),
      qc.invalidateQueries({ queryKey: ["devis-charge-choix"] }),
    ]);
    window.dispatchEvent(new Event("affaire-updated"));
  };
}

export function DevisStatutListe({ row }: { row: DevisLigneAction }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ActionStatut | null>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("");
  const [suite, setSuite] = useState<ActionStatut | null>(null);
  const valideOk = useRef(false);
  const [signOpp, setSignOpp] = useState<{ code: string; client: string | null; typologie: TypologieFuture | null } | null>(null);
  const refresh = useRafraichirListe(row.id);
  const navigate = useNavigate();
  const droits = useQuery({
    queryKey: ["devis-actions-droits", row.id, row.statut_redaction, row.charge_affaires_id], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_lire", { _devis_id: row.id });
      if (error) throw error;
      const d = data as unknown as DevisData;
      return { ecrire: d.droits.ecrire, valider: d.droits.valider };
    },
  });
  const actions = actionsStatutListe(row.statut_redaction, droits.data?.ecrire ?? false, droits.data?.valider ?? false, row.numero_progbat, row.date_envoi);
  const avantFinal = row.statut_redaction === "brouillon" || row.statut_redaction === "a_valider";
  const label = (a: ActionStatut) => avantFinal && a === "envoye" ? "Finaliser puis marquer envoyé…" : avantFinal && a === "signe" ? "Finaliser puis signé…" : a === "envoye" ? "Marquer envoyé…" : a === "revision" ? "Réviser · nouvelle version…" : `${STATUT_LABEL[a]}${["a_valider", "valide", "transfere"].includes(a) ? "…" : ""}`;
  const enregistrer = async () => {
    if (!action || busy) return;
    setBusy(true);
    let opp: typeof signOpp = null;
    try {
      if (action === "signe") {
        const { data: affaire, error } = await supabase.from("affaires").select("phase,statut_opportunite,numero,code_opportunite,typologie_future,clients(nom)").eq("id", row.affaire_id).single();
        if (error) throw error;
        if (affaire.phase === "opportunite" && affaire.statut_opportunite !== "gagne") {
          const { error: err } = await supabase.rpc("app_modifier_affaire", { _id: row.affaire_id, _patch: { statut_opportunite: "gagne" } });
          if (err) throw err;
        }
        if (affaire.phase === "opportunite") opp = { code: affaire.code_opportunite ?? affaire.numero ?? "", client: (affaire.clients as { nom: string } | null)?.nom ?? null, typologie: (affaire.typologie_future ?? null) as TypologieFuture | null };
      }
      const result = action === "envoye"
        ? await supabase.rpc("devis_marquer_envoye", { _devis_id: row.id, _date: date })
        : action === "signe"
          ? await supabase.rpc("devis_marquer_signe", { _devis_id: row.id })
          : action === "revision"
            ? await supabase.rpc("devis_nouvelle_version", { _devis_id: row.id })
            : await supabase.rpc("devis_statut_changer", { _devis_id: row.id, _statut: action as DevisStatut });
      if (result.error) throw result.error;
      await refresh(); setAction(null);
      if (opp) setSignOpp(opp);
      toast.success(action === "revision" ? "Nouvelle version en brouillon créée" : "Statut du devis mis à jour");
    } catch (e) { toast.error(e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : "Modification impossible"); }
    finally { setBusy(false); }
  };
  return <div onClick={(e) => e.stopPropagation()}>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-auto gap-1 px-1 py-1" aria-label={`Changer le statut de ${row.numero}`}>
        <DevisStatutBadge statut={row.statut_redaction} label={libelleStatutDevis(row.statut_redaction, row.numero_progbat, row.date_envoi, STATUT_LABEL)} /><ChevronDown className="h-3 w-3 text-muted-foreground" />
      </Button></PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <p className="px-2 py-2 text-xs font-semibold">Statut · {row.numero}</p>
        {droits.isFetching ? <p className="p-2 text-sm text-muted-foreground">Chargement…</p> : droits.error ? <p role="alert" className="p-2 text-sm text-destructive">Droits indisponibles.</p> : <>
          {actions.map((a) => <Button key={a} variant="ghost" className={`h-auto w-full justify-start py-2 text-sm ${a === "refuse" || a === "remplace" ? "text-destructive" : ""}`} onClick={() => {
            setOpen(false); setDate(new Date().toISOString().slice(0, 10));
            if (avantFinal && (a === "envoye" || a === "signe")) { setSuite(a); setAction("valide"); } else { setSuite(null); setAction(a); }
          }}>{label(a)}</Button>)}
          {!actions.length && <p className="p-2 text-sm text-muted-foreground">Aucun changement autorisé.</p>}
        </>}
      </PopoverContent>
    </Popover>
    {(action === "valide" || action === "a_valider") && <AvantValiderDialog devisId={row.id} cible={action} open onOpenChange={(o) => { if (!o) { const ok = valideOk.current; valideOk.current = false; setAction(ok && suite ? suite : null); setSuite(null); } }} onDone={() => { valideOk.current = true; void refresh(); }}
      onAller={({ ligneId }) => void navigate({ to: "/affaires/$affaireId/devis-staffing/$devisId", params: { affaireId: row.affaire_id, devisId: row.id }, ...(ligneId ? { hash: `ligne-${ligneId}` } : {}) })} />}
    {action === "transfere" && <EnregistrerTransfertDialog devisId={row.id} netHt={Number(row.net_ht ?? 0)} numeroActuel={row.numero_progbat} open onOpenChange={(o) => { if (!o) setAction(null); }} onDone={() => void refresh()} />}
    {signOpp && <SignerOpportuniteDialog open onOpenChange={(o) => { if (!o) setSignOpp(null); }} affaireId={row.affaire_id} oldCode={signOpp.code} clientLabel={signOpp.client} typologieFuture={signOpp.typologie}
      onSigned={() => { setSignOpp(null); void refresh(); toast.success("Opportunité convertie en chantier. La fabrication reste à créer depuis l’affaire."); }} />}
    <Dialog open={!!action && !["a_valider", "valide", "transfere"].includes(action)} onOpenChange={(o) => { if (!o && !busy) setAction(null); }}>
      <DialogContent><DialogHeader><DialogTitle>{action ? label(action) : "Changer le statut"} · {row.numero}</DialogTitle>
        <DialogDescription>{action === "signe" ? "Confirmez que le client a signé ce devis. L’opportunité passe en « Gagné », cette version devient signée et les autres versions ouvertes sont refusées. La conversion en chantier et la création de fabrication restent à effectuer dans l’affaire."
          : action === "revision" ? "Une nouvelle version en brouillon sera créée. La version actuelle sera remplacée, sauf si elle est signée."
          : action === "envoye" ? "Indiquez la date de l’envoi déjà effectué. Aucun e-mail ne sera envoyé."
          : "Confirmer le changement de statut de ce devis ?"}</DialogDescription></DialogHeader>
        {action === "envoye" && <Input type="date" aria-label="Date d’envoi" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setAction(null)}>Annuler</Button><Button disabled={busy || (action === "envoye" && !date)} onClick={() => void enregistrer()}>{busy ? "Enregistrement…" : "Confirmer"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

export function DevisChargeListe({ row }: { row: DevisLigneAction }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [choix, setChoix] = useState<ChoixCharge | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useRafraichirListe(row.id);
  const liste = useQuery({ queryKey: ["devis-charge-choix", row.id], enabled: open, queryFn: async () => {
    const { data, error } = await supabase.rpc("devis_charges_affaires_choix", { _devis_id: row.id });
    if (error) throw error; return (data ?? []) as ChoixCharge[];
  } });
  const groupes = useMemo(() => grouperCharges(liste.data ?? [], q), [liste.data, q]);
  const nom = (c: ChoixCharge) => [c.prenom, c.nom].filter(Boolean).join(" ");
  const enregistrer = async () => {
    if (!choix || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("app_affecter_role_projet", { _affaire_id: row.affaire_id, _role: "charge_affaires", _employe_id: choix.id });
      if (error) throw error;
      await refresh(); setChoix(null); toast.success("Chargé d’affaires mis à jour sur le chantier et ses devis");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Changement impossible"); }
    finally { setBusy(false); }
  };
  return <div onClick={(e) => e.stopPropagation()}>
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setQ(""); }}>
      <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-auto max-w-44 gap-1 whitespace-normal px-1 py-1 text-left font-normal" aria-label={`Changer le chargé d’affaires de ${row.numero}`}>
        <span>{row.charge_affaires_nom || "À affecter"}</span><ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </Button></PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-2">
        <Input autoFocus aria-label="Rechercher un chargé d’affaires" placeholder="Rechercher un employé…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2 max-h-64 overflow-y-auto">
          {liste.isFetching ? <p className="p-2 text-sm text-muted-foreground">Chargement…</p> : liste.error ? <p role="alert" className="p-2 text-sm text-destructive">Choix indisponibles.</p> : <>
            {[{ titre: "Habituels", items: groupes.habituels }, { titre: "Autres employés", items: groupes.autres }].map((g) => g.items.length > 0 && <div key={g.titre}><p className="px-2 py-1 text-xs text-muted-foreground">{g.titre}</p>
              {g.items.map((c) => <Button key={c.id} variant="ghost" disabled={c.id === row.charge_affaires_id} className="h-auto w-full justify-between whitespace-normal py-2 text-left font-normal" onClick={() => { setChoix(c); setOpen(false); }}>
                {nom(c)}{c.id === row.charge_affaires_id && <Check className="h-4 w-4 shrink-0" />}
              </Button>)}
            </div>)}
            {!liste.data?.length ? <p className="p-2 text-sm text-muted-foreground">Vous ne pouvez pas modifier le chargé d’affaires de ce chantier.</p> : !groupes.habituels.length && !groupes.autres.length && <p className="p-2 text-sm text-muted-foreground">Aucun employé actif trouvé.</p>}
          </>}
        </div>
      </PopoverContent>
    </Popover>
    <Dialog open={!!choix} onOpenChange={(o) => { if (!o && !busy) setChoix(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Changer le chargé d’affaires</DialogTitle><DialogDescription>Nommer {choix ? nom(choix) : ""} ? Ce changement s’applique à tout le chantier {row.affaire_numero ?? ""} et à ses autres devis.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setChoix(null)}>Annuler</Button><Button disabled={busy} onClick={() => void enregistrer()}>{busy ? "Enregistrement…" : "Confirmer"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}