import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Loader2, Receipt, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CONDITIONS_PAIEMENT, PAYS_OPTIONS, champsManquantsPennylane, codePostalValide,
  emailValide, luhnOk, nettoyerChiffres, sirenEffectif, tvaCoherente, tvaDepuisSiren,
} from "@/lib/clients/pennylane";

const CHAMPS =
  "id, nom, siret, siren, adresse, code_postal, ville, tva_intracom, type_client, civilite_facturation, prenom_facturation, nom_facturation, pays, emails_facturation, destinataire_facturation, livraison_identique, adresse_livraison, code_postal_livraison, ville_livraison, pays_livraison, conditions_paiement, langue_facturation, reference_client, numero_compte_client, pennylane_id";

type F = {
  nom: string; siret: string; siren: string; adresse: string; code_postal: string; ville: string;
  tva_intracom: string; type_client: string; civilite_facturation: string; prenom_facturation: string;
  nom_facturation: string; pays: string; emails_facturation: string[]; destinataire_facturation: string;
  livraison_identique: boolean; adresse_livraison: string; code_postal_livraison: string;
  ville_livraison: string; pays_livraison: string; conditions_paiement: string; langue_facturation: string;
  reference_client: string; numero_compte_client: string; pennylane_id: string;
};

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

export function FacturationPennylaneCard({ clientId, onSaved }: { clientId: string; onSaved?: () => void }) {
  const [f, setF] = useState<F | null>(null);
  const [initial, setInitial] = useState<F | null>(null);
  const [mail, setMail] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("clients").select(CHAMPS).eq("id", clientId).maybeSingle();
    if (error || !data) return;
    const d = data as Record<string, unknown>;
    const v: F = Object.fromEntries(
      Object.entries(d).map(([k, x]) => [k, x ?? ""]),
    ) as unknown as F;
    v.emails_facturation = (d.emails_facturation as string[]) ?? [];
    v.livraison_identique = (d.livraison_identique as boolean) ?? true;
    setF(v); setInitial(v);
  }
  useEffect(() => { void load(); }, [clientId]);

  if (!f) return <Card className="p-4"><Loader2 className="h-4 w-4 animate-spin" /></Card>;
  const set = <K extends keyof F>(k: K, v: F[K]) => setF({ ...f, [k]: v });

  const sirenAff = sirenEffectif(f.siren, f.siret);
  const manquants = champsManquantsPennylane(f);
  const siretClean = nettoyerChiffres(f.siret);
  const sirenClean = nettoyerChiffres(f.siren);
  const erreurs: string[] = [];
  if (siretClean && !luhnOk(siretClean)) erreurs.push("SIRET invalide (14 chiffres, clé de contrôle)");
  if (sirenClean && !luhnOk(sirenClean)) erreurs.push("SIREN invalide (9 chiffres, clé de contrôle)");
  if (sirenClean && siretClean && siretClean.slice(0, 9) !== sirenClean) erreurs.push("SIREN et SIRET ne correspondent pas");
  if (!codePostalValide(f.code_postal.trim(), f.pays)) erreurs.push("Code postal français : 5 chiffres");
  if (!f.livraison_identique && !codePostalValide(f.code_postal_livraison.trim(), f.pays_livraison || f.pays))
    erreurs.push("Code postal de livraison : 5 chiffres");
  if (f.numero_compte_client && !/^411[0-9A-Z]{1,12}$/.test(f.numero_compte_client.trim()))
    erreurs.push("Numéro de compte : commence par 411");
  const tvaOk = tvaCoherente(f.tva_intracom, sirenAff);

  function ajouterMail() {
    const e = mail.trim();
    if (!e) return;
    if (!emailValide(e)) { toast.error("E-mail invalide"); return; }
    if (!f!.emails_facturation.includes(e)) set("emails_facturation", [...f!.emails_facturation, e]);
    setMail("");
  }

  async function save() {
    if (!f || !initial) return;
    if (erreurs.length) { toast.error(erreurs[0]); return; }
    const n = (s: string) => (s.trim() ? s.trim() : null);
    const payload: Record<string, unknown> = {
      type_client: f.type_client || "entreprise",
      civilite_facturation: n(f.civilite_facturation),
      prenom_facturation: n(f.prenom_facturation),
      nom_facturation: n(f.nom_facturation),
      pays: f.pays || "FR",
      siren: n(sirenClean),
      adresse: n(f.adresse), code_postal: n(f.code_postal), ville: n(f.ville),
      tva_intracom: n(f.tva_intracom.replace(/\s/g, "").toUpperCase()),
      emails_facturation: f.emails_facturation,
      destinataire_facturation: n(f.destinataire_facturation),
      livraison_identique: f.livraison_identique,
      adresse_livraison: n(f.adresse_livraison), code_postal_livraison: n(f.code_postal_livraison),
      ville_livraison: n(f.ville_livraison), pays_livraison: n(f.pays_livraison),
      conditions_paiement: n(f.conditions_paiement),
      langue_facturation: f.langue_facturation || "fr_FR",
      reference_client: n(f.reference_client),
      numero_compte_client: n(f.numero_compte_client.toUpperCase()),
    };
    // N'envoyer que ce qui a changé : aucune réécriture des données existantes.
    const diff: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      const old = (initial as Record<string, unknown>)[k];
      const oldN = old === "" ? null : old;
      if (JSON.stringify(oldN) !== JSON.stringify(v)) diff[k] = v;
    }
    if (!Object.keys(diff).length) { toast.info("Aucune modification"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("clients").update(diff as never).eq("id", clientId).select("id");
    setSaving(false);
    if (error) { toast.error("Enregistrement impossible", { description: error.message }); return; }
    if (!data?.length) { toast.error("Vous n'avez pas le droit de modifier cette fiche."); return; }
    toast.success("Facturation enregistrée");
    await load(); onSaved?.();
  }

  const particulier = f.type_client === "particulier";

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium"><Receipt className="h-4 w-4" /> Facturation (Pennylane)</div>
        {manquants.length === 0 ? (
          <Badge className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Fiche complète pour Pennylane</Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-destructive text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> Incomplète : {manquants.join(", ")}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Type de client</Label>
          <select className={sel} value={f.type_client} onChange={(e) => set("type_client", e.target.value)}>
            <option value="entreprise">Entreprise</option><option value="particulier">Particulier</option>
          </select></div>
        <div><Label>Pays</Label>
          <select className={sel} value={f.pays} onChange={(e) => set("pays", e.target.value)}>
            {PAYS_OPTIONS.map((p) => <option key={p.code} value={p.code}>{p.label} ({p.code})</option>)}
            {!PAYS_OPTIONS.some((p) => p.code === f.pays) && <option value={f.pays}>{f.pays}</option>}
          </select></div>

        {particulier && (<>
          <div><Label>Civilité</Label>
            <select className={sel} value={f.civilite_facturation} onChange={(e) => set("civilite_facturation", e.target.value)}>
              <option value="">—</option><option value="M">M.</option><option value="Mme">Mme</option>
            </select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Prénom</Label><Input value={f.prenom_facturation} onChange={(e) => set("prenom_facturation", e.target.value)} /></div>
            <div><Label>Nom</Label><Input value={f.nom_facturation} onChange={(e) => set("nom_facturation", e.target.value)} /></div>
          </div>
        </>)}

        <div><Label>SIREN</Label>
          <Input value={f.siren} placeholder={sirenAff && !f.siren ? `${sirenAff} (déduit du SIRET)` : "9 chiffres"}
            onChange={(e) => set("siren", e.target.value)} />
          {f.siret && <p className="text-xs text-muted-foreground mt-1">SIRET : {f.siret}</p>}</div>
        <div><Label>N° de TVA</Label>
          <div className="flex gap-2">
            <Input value={f.tva_intracom} onChange={(e) => set("tva_intracom", e.target.value)} />
            <Button type="button" variant="outline" size="sm" disabled={!sirenAff}
              onClick={() => sirenAff && set("tva_intracom", tvaDepuisSiren(sirenAff) ?? "")}>
              Calculer depuis le SIREN
            </Button>
          </div>
          {tvaOk === false && <p className="text-xs text-destructive mt-1">La TVA ne correspond pas au SIREN ({tvaDepuisSiren(sirenAff!)}).</p>}
        </div>

        <div className="sm:col-span-2"><Label>Adresse de facturation</Label>
          <Input value={f.adresse} onChange={(e) => set("adresse", e.target.value)} /></div>
        <div><Label>Code postal</Label><Input value={f.code_postal} onChange={(e) => set("code_postal", e.target.value)} /></div>
        <div><Label>Ville</Label><Input value={f.ville} onChange={(e) => set("ville", e.target.value)} /></div>

        <div className="sm:col-span-2"><Label>E-mails de facturation</Label>
          <div className="flex flex-wrap gap-1 mb-1">
            {f.emails_facturation.map((e) => (
              <Badge key={e} variant="secondary" className="gap-1">{e}
                <button type="button" aria-label={`Retirer ${e}`} onClick={() => set("emails_facturation", f.emails_facturation.filter((x) => x !== e))}><X className="h-3 w-3" /></button>
              </Badge>))}
          </div>
          <div className="flex gap-2">
            <Input value={mail} placeholder="compta@client.fr" onChange={(e) => setMail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); ajouterMail(); } }} />
            <Button type="button" variant="outline" size="sm" onClick={ajouterMail}>Ajouter</Button>
          </div></div>
        <div><Label>Destinataire</Label><Input value={f.destinataire_facturation} onChange={(e) => set("destinataire_facturation", e.target.value)} /></div>
        <div><Label>Conditions de paiement</Label>
          <select className={sel} value={f.conditions_paiement} onChange={(e) => set("conditions_paiement", e.target.value)}>
            <option value="">Conditions de l'entreprise</option>
            {CONDITIONS_PAIEMENT.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div><Label>Langue de facturation</Label>
          <select className={sel} value={f.langue_facturation} onChange={(e) => set("langue_facturation", e.target.value)}>
            <option value="fr_FR">Français (fr_FR)</option><option value="en_GB">Anglais (en_GB)</option>
          </select></div>
        <div><Label>Référence client</Label><Input value={f.reference_client} onChange={(e) => set("reference_client", e.target.value)} /></div>
        <div><Label>Numéro de compte client</Label><Input value={f.numero_compte_client} placeholder="411…" onChange={(e) => set("numero_compte_client", e.target.value)} /></div>
        <div><Label>Identifiant Pennylane</Label><Input value={f.pennylane_id} disabled placeholder="Rempli lors d'une future synchro" /></div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={f.livraison_identique} onCheckedChange={(v) => set("livraison_identique", v === true)} />
          Adresse de livraison identique à l'adresse de facturation
        </label>
        {!f.livraison_identique && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Adresse de livraison</Label><Input value={f.adresse_livraison} onChange={(e) => set("adresse_livraison", e.target.value)} /></div>
            <div><Label>Code postal</Label><Input value={f.code_postal_livraison} onChange={(e) => set("code_postal_livraison", e.target.value)} /></div>
            <div><Label>Ville</Label><Input value={f.ville_livraison} onChange={(e) => set("ville_livraison", e.target.value)} /></div>
            <div><Label>Pays</Label>
              <select className={sel} value={f.pays_livraison} onChange={(e) => set("pays_livraison", e.target.value)}>
                <option value="">Même pays que la facturation</option>
                {PAYS_OPTIONS.map((p) => <option key={p.code} value={p.code}>{p.label} ({p.code})</option>)}
              </select></div>
          </div>
        )}
      </div>

      {erreurs.length > 0 && <ul className="text-xs text-destructive list-disc pl-4">{erreurs.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Enregistrer la facturation</Button>
      </div>
    </Card>
  );
}
