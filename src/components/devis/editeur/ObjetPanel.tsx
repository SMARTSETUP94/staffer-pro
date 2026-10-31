import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ImagePlus, Lock, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ecartTauxPct } from "@/lib/devis/calcul";
import { TYPE_LABEL, eur, type DevisData, type Ligne, type Heure, type Materiau, type Libre } from "./api";
import { MateriauAjoutDialog } from "./MateriauAjoutDialog";

type Call = <T = unknown>(fn: string, args: Record<string, unknown>, opts?: { silent?: boolean; refresh?: boolean }) => Promise<T | null>;
type Patch = (mut: (d: DevisData) => DevisData) => void;
type Save = (key: string, run: () => Promise<unknown>) => void;

const num = (v: string) => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : 0; };

/** Champ texte/nombre : mise à jour immédiate en cache + enregistrement automatique. */
function Field({ value, onValue, numeric, className, placeholder, disabled, onEnter, multiline }: {
  value: string | number | null | undefined; onValue: (v: string) => void; numeric?: boolean; className?: string;
  placeholder?: string; disabled?: boolean; onEnter?: () => void; multiline?: boolean;
}) {
  const [v, setV] = useState(value == null ? "" : String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setV(value == null ? "" : String(value)); }, [value, focus]);
  const props = {
    value: v, disabled, placeholder,
    onFocus: () => setFocus(true), onBlur: () => setFocus(false),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setV(e.target.value); onValue(e.target.value); },
  };
  if (multiline) return <Textarea {...props} className={className} />;
  return <Input {...props} inputMode={numeric ? "decimal" : undefined} className={`h-8 ${className ?? ""}`}
    onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }} />;
}

export function ObjetPanel({ data, ligne, readOnly, call, patch, save, onSelect }: {
  data: DevisData; ligne: Ligne; readOnly: boolean; call: Call; patch: Patch; save: Save; onSelect: (id: string) => void;
}) {
  const devisId = data.devis.id;
  const couts = data.droits.couts;
  const seuil = Number(data.parametres.seuil_alerte_taux_pct ?? 10);
  const [matOpen, setMatOpen] = useState(false);

  const postes = useQuery({
    queryKey: ["devis-taux"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_taux_lister");
      if (error) throw error;
      return data ?? [];
    },
  });
  const ecarts = useQuery({
    queryKey: ["devis-ecarts", devisId],
    enabled: !readOnly,
    queryFn: async () => (await supabase.rpc("devis_materiaux_ecarts", { _devis_id: devisId })).data ?? [],
  });
  const photoUrls = useQuery({
    queryKey: ["devis-photos-urls", devisId, data.photos.map((p) => p.id).join(",")],
    enabled: data.photos.length > 0,
    queryFn: async () => {
      const paths = data.photos.map((p) => p.thumb_path ?? p.storage_path);
      const { data: s } = await supabase.storage.from("devis-photos").createSignedUrls(paths, 3600);
      return Object.fromEntries((s ?? []).map((x, i) => [data.photos[i].id, x.signedUrl]));
    },
  });

  const posteList = [...new Map((postes.data ?? []).filter((p) => p.actif).map((p) => [p.poste_id, p])).values()];
  const niveaux = (posteId: string) => (postes.data ?? []).filter((p) => p.poste_id === posteId && p.niveau).map((p) => p.niveau as string);

  // ---- ligne ----
  const setLigne = (k: keyof Ligne, raw: string | boolean, isNum = false) => {
    const v = typeof raw === "boolean" ? raw : isNum ? (raw === "" ? null : num(raw)) : raw;
    patch((d) => ({ ...d, lignes: d.lignes.map((l) => (l.id === ligne.id ? { ...l, [k]: k === "quantite" ? (v ?? 1) : v } : l)) }));
    save(`l:${ligne.id}:${k}`, () => call("devis_ligne_enregistrer", { _devis_id: devisId, _l: { id: ligne.id, [k]: v } }, { refresh: false }));
  };

  // ---- heures ----
  const heures = data.heures.filter((h) => h.ligne_id === ligne.id);
  const setHeure = (h: Heure, k: "heures" | "taux_vente" | "par_unite", raw: string | boolean) => {
    const v = typeof raw === "boolean" ? raw : num(raw);
    patch((d) => ({ ...d, heures: d.heures.map((x) => (x.id === h.id ? { ...x, [k]: v } : x)) }));
    save(`h:${h.id}:${k}`, () => call("devis_heure_enregistrer", { _ligne_id: ligne.id, _h: { id: h.id, [k]: v } }, { refresh: false }));
  };
  const addHeure = async (posteId?: string) => {
    const p = posteId ?? posteList[0]?.poste_id;
    if (!p) return toast.error("Aucun poste dans la grille des taux");
    await call("devis_heure_enregistrer", { _ligne_id: ligne.id, _h: { poste_id: p } });
  };

  // ---- matériaux / libres ----
  const mats = data.materiaux.filter((m) => m.ligne_id === ligne.id);
  const setMat = (m: Materiau, k: "quantite" | "coefficient" | "prix_achat", raw: string) => {
    const v = num(raw);
    patch((d) => ({ ...d, materiaux: d.materiaux.map((x) => (x.id === m.id ? { ...x, [k]: v } : x)) }));
    save(`m:${m.id}:${k}`, () => call("devis_materiau_enregistrer", { _ligne_id: ligne.id, _m: { id: m.id, [k]: v } }, { refresh: false }));
  };
  const libres = data.libres.filter((f) => f.ligne_id === ligne.id);
  const setLibre = (f: Libre, k: keyof Libre, raw: string | boolean) => {
    const v = typeof raw === "boolean" ? raw : ["designation", "unite", "categorie"].includes(k) ? raw : raw === "" ? null : num(raw);
    patch((d) => ({ ...d, libres: d.libres.map((x) => (x.id === f.id ? { ...x, [k]: v } : x)) }));
    save(`f:${f.id}:${k}`, () => call("devis_libre_enregistrer", { _ligne_id: ligne.id, _f: { id: f.id, [k]: v } }, { refresh: false }));
  };
  const remove = async (kind: "heure" | "materiau" | "libre", id: string) => {
    await call("devis_element_supprimer", { _kind: kind, _id: id });
    toast("Ligne supprimée", { action: { label: "Annuler", onClick: () => void call("devis_element_supprimer", { _kind: kind, _id: id, _restaurer: true }) } });
  };

  // ---- photos ----
  const photos = data.photos.filter((p) => p.ligne_id === ligne.id);
  const upload = async (files: FileList | null) => {
    for (const f of [...(files ?? [])]) {
      if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(f.type)) { toast.error(`${f.name} : JPG, PNG ou PDF uniquement`); continue; }
      const path = `${devisId}/${ligne.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from("devis-photos").upload(path, f, { contentType: f.type });
      if (error) { toast.error(error.message); continue; }
      let width: number | null = null, height: number | null = null;
      if (f.type.startsWith("image/")) {
        const bmp = await createImageBitmap(f).catch(() => null);
        if (bmp) { width = bmp.width; height = bmp.height; }
      }
      await call("devis_photo_ajouter", { _ligne_id: ligne.id, _p: { storage_path: path, mime: f.type, size_bytes: f.size, width, height } });
    }
  };

  const enfantsCommentaires = data.lignes.filter((l) => l.parent_id === ligne.id && l.type === "commentaire").sort((a, b) => a.ordre - b.ordre);
  const parent = data.lignes.find((l) => l.id === ligne.parent_id);
  const totalLigne = data.calcul.lignes[ligne.id] ?? 0;

  if (ligne.type === "commentaire") {
    return (
      <div className="space-y-3">
        <p className="text-xs uppercase text-muted-foreground">Commentaire</p>
        <Field multiline value={ligne.texte} disabled={readOnly} onValue={(v) => setLigne("texte", v)} className="min-h-32" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ligne.interne} disabled={readOnly} onChange={(e) => setLigne("interne", e.target.checked)} />
          <Lock className="h-3.5 w-3.5" />Interne (masqué en vue client)
        </label>
      </div>
    );
  }

  const avecChiffrage = ligne.type !== "zone";

  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground">
        {parent && <button type="button" className="hover:underline" onClick={() => onSelect(parent.id)}>{parent.libelle || TYPE_LABEL[parent.type]}</button>}
        {parent && " › "}<span>{TYPE_LABEL[ligne.type]}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_90px]">
        <Field value={ligne.libelle} disabled={readOnly} placeholder="Intitulé" onValue={(v) => setLigne("libelle", v)} className="text-base font-medium" />
        {ligne.type !== "zone" && <Field numeric value={ligne.quantite} disabled={readOnly} placeholder="Qté" onValue={(v) => setLigne("quantite", v, true)} />}
      </div>
      <Field multiline value={ligne.descriptif_client} disabled={readOnly} placeholder="Descriptif client" onValue={(v) => setLigne("descriptif_client", v)} />
      {ligne.type === "objet" && (
        <div className="grid grid-cols-4 gap-2">
          <Field numeric value={ligne.longueur_mm} disabled={readOnly} placeholder="Longueur mm" onValue={(v) => setLigne("longueur_mm", v, true)} />
          <Field numeric value={ligne.largeur_mm} disabled={readOnly} placeholder="Largeur mm" onValue={(v) => setLigne("largeur_mm", v, true)} />
          <Field numeric value={ligne.hauteur_mm} disabled={readOnly} placeholder="Hauteur mm" onValue={(v) => setLigne("hauteur_mm", v, true)} />
          <Field value={ligne.finition} disabled={readOnly} placeholder="Finition" onValue={(v) => setLigne("finition", v)} />
        </div>
      )}

      {/* Photos */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Photos</h3>
          {!readOnly && (
            <label className="inline-flex cursor-pointer items-center gap-1 text-sm text-primary">
              <ImagePlus className="h-4 w-4" />Ajouter
              <input type="file" multiple accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.id} className="w-36 space-y-1 rounded-md border p-1 text-xs">
              {p.mime === "application/pdf"
                ? <a href={photoUrls.data?.[p.id]} target="_blank" rel="noreferrer" className="flex h-20 items-center justify-center bg-muted">PDF</a>
                : <img src={photoUrls.data?.[p.id]} alt={p.legende ?? ""} className="h-20 w-full rounded object-cover" />}
              <Field value={p.legende} disabled={readOnly} placeholder="Légende" onValue={(v) => save(`p:${p.id}`, () => call("devis_photo_modifier", { _photo_id: p.id, _p: { legende: v } }, { refresh: false }))} />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1"><input type="checkbox" checked={p.visible_client} disabled={readOnly}
                  onChange={(e) => void call("devis_photo_modifier", { _photo_id: p.id, _p: { visible_client: e.target.checked } })} />Visible client</label>
                {!readOnly && <button type="button" aria-label="Supprimer la photo" onClick={() => void call("devis_photo_modifier", { _photo_id: p.id, _p: { supprimer: true } })}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
          {photos.length === 0 && <p className="text-xs text-muted-foreground">Aucune photo.</p>}
        </div>
      </section>

      {avecChiffrage && (
        <>
          {/* Heures */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Heures</h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr>
                <th className="text-left">Poste</th><th className="text-left">Niveau</th><th>Heures</th><th title="Décoché : heures communes, non multipliées par la quantité">Par unité</th>
                <th>Taux €/h</th><th className="text-right">Montant</th><th />
              </tr></thead>
              <tbody>
                {heures.map((h, i) => {
                  const ec = ecartTauxPct(h.taux_vente, h.taux_grille);
                  const montant = h.heures * h.taux_vente * (h.par_unite ? Number(ligne.quantite) : 1);
                  return (
                    <tr key={h.id}>
                      <td><select disabled={readOnly} className="h-8 w-full rounded border bg-background px-1" value={h.poste_id}
                        onChange={(e) => void call("devis_heure_enregistrer", { _ligne_id: ligne.id, _h: { id: h.id, poste_id: e.target.value, niveau: "" } })}>
                        {posteList.map((p) => <option key={p.poste_id} value={p.poste_id}>{p.libelle}</option>)}
                      </select></td>
                      <td><select disabled={readOnly} className="h-8 w-28 rounded border bg-background px-1" value={h.niveau}
                        onChange={(e) => void call("devis_heure_enregistrer", { _ligne_id: ligne.id, _h: { id: h.id, niveau: e.target.value } })}>
                        {[...new Set([h.niveau, ...niveaux(h.poste_id)])].map((n) => <option key={n}>{n}</option>)}
                      </select></td>
                      <td><Field numeric value={h.heures} disabled={readOnly} className="w-20 text-right" onValue={(v) => setHeure(h, "heures", v)}
                        onEnter={() => (i === heures.length - 1 ? void addHeure(h.poste_id) : undefined)} /></td>
                      <td className="text-center"><input type="checkbox" checked={h.par_unite} disabled={readOnly} onChange={(e) => setHeure(h, "par_unite", e.target.checked)} /></td>
                      <td>
                        <div className="flex items-center gap-1">
                          <Field numeric value={h.taux_vente} disabled={readOnly} className="w-20 text-right" onValue={(v) => setHeure(h, "taux_vente", v)}
                            onEnter={() => (i === heures.length - 1 ? void addHeure(h.poste_id) : undefined)} />
                          {ec != null && Math.abs(ec) > seuil && <span title={`Grille : ${h.taux_grille} €/h`}><Badge variant="destructive" className="px-1 text-[10px]">{ec > 0 ? "+" : ""}{ec} %</Badge></span>}
                        </div>
                      </td>
                      <td className="text-right tabular-nums">{eur(montant)}</td>
                      <td>{!readOnly && <button type="button" aria-label="Supprimer" onClick={() => void remove("heure", h.id)}><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!readOnly && <Button size="sm" variant="outline" onClick={() => void addHeure()}><Plus className="mr-1 h-3.5 w-3.5" />Ligne d'heures</Button>}
          </section>

          {/* Commentaires dans l'objet */}
          {enfantsCommentaires.length > 0 && (
            <section className="space-y-1">
              {enfantsCommentaires.map((c) => (
                <button type="button" key={c.id} onClick={() => onSelect(c.id)} className="block w-full rounded border-l-2 border-muted-foreground/40 bg-muted/40 px-2 py-1 text-left text-sm italic">
                  {c.interne && <Lock className="mr-1 inline h-3 w-3" />}{c.texte || "Commentaire"}
                </button>
              ))}
            </section>
          )}

          {/* Matériaux */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Matériaux</h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr>
                <th className="text-left">Désignation</th><th>Quantité</th>{couts && <th>Achat €</th>}<th>Coef</th>{couts && <th className="text-right">Vente</th>}<th />
              </tr></thead>
              <tbody>
                {mats.map((m) => {
                  const ec = (ecarts.data ?? []).find((e) => e.devis_materiau_id === m.id);
                  return (
                    <tr key={m.id}>
                      <td className="max-w-64">
                        <div className="truncate">{m.designation}</div>
                        <div className="text-xs text-muted-foreground">{[m.fournisseur, m.ref, m.unite, m.date_tarif && `tarif ${new Date(m.date_tarif).toLocaleDateString("fr-FR")}`].filter(Boolean).join(" · ")}
                          {m.propose_catalogue && <Badge variant="outline" className="ml-1 text-[10px]">proposé au catalogue</Badge>}</div>
                        {ec && !readOnly && (
                          <button type="button" className="flex items-center gap-1 text-xs text-destructive" onClick={async () => { await call("devis_materiau_maj_prix", { _devis_materiau_id: m.id }); void ecarts.refetch(); }}>
                            <AlertTriangle className="h-3 w-3" />Prix catalogue modifié depuis{couts && ec.nouveau_prix != null ? ` (${eur(ec.nouveau_prix)})` : ""} — <RefreshCw className="h-3 w-3" />mettre à jour
                          </button>
                        )}
                      </td>
                      <td><Field numeric value={m.quantite} disabled={readOnly} className="w-20 text-right" onValue={(v) => setMat(m, "quantite", v)} onEnter={() => setMatOpen(true)} /></td>
                      {couts && <td><Field numeric value={m.prix_achat} disabled={readOnly} className="w-24 text-right" onValue={(v) => setMat(m, "prix_achat", v)} /></td>}
                      <td><Field numeric value={m.coefficient} disabled={readOnly} className="w-16 text-right" onValue={(v) => setMat(m, "coefficient", v)} /></td>
                      {couts && <td className="text-right tabular-nums">{eur(m.quantite * (m.prix_achat ?? 0) * m.coefficient)}</td>}
                      <td>{!readOnly && <button type="button" aria-label="Supprimer" onClick={() => void remove("materiau", m.id)}><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!readOnly && <Button size="sm" variant="outline" onClick={() => setMatOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />Matériau</Button>}
          </section>

          {/* Lignes libres */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Achats spécifiques, sous-traitance, location, forfaits</h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr>
                <th className="text-left">Désignation</th><th>Type</th><th>Qté</th>{couts && <th>Achat €</th>}<th>Coef</th><th>Forfait €</th><th>Par unité</th><th />
              </tr></thead>
              <tbody>
                {libres.map((f) => (
                  <tr key={f.id}>
                    <td><Field value={f.designation} disabled={readOnly} onValue={(v) => setLibre(f, "designation", v)} /></td>
                    <td><select disabled={readOnly} className="h-8 rounded border bg-background px-1" value={f.categorie} onChange={(e) => setLibre(f, "categorie", e.target.value)}>
                      <option value="achat">Achat</option><option value="sous_traitance">Sous-traitance</option><option value="location">Location</option><option value="forfait">Forfait</option>
                    </select></td>
                    <td><Field numeric value={f.quantite} disabled={readOnly} className="w-16 text-right" onValue={(v) => setLibre(f, "quantite", v)} /></td>
                    {couts && <td><Field numeric value={f.prix_achat} disabled={readOnly} className="w-20 text-right" onValue={(v) => setLibre(f, "prix_achat", v)} /></td>}
                    <td><Field numeric value={f.coefficient} disabled={readOnly} className="w-16 text-right" onValue={(v) => setLibre(f, "coefficient", v)} /></td>
                    <td><Field numeric value={f.prix_forfait} disabled={readOnly} className="w-20 text-right" onValue={(v) => setLibre(f, "prix_forfait", v)} /></td>
                    <td className="text-center"><input type="checkbox" checked={f.par_unite} disabled={readOnly} onChange={(e) => setLibre(f, "par_unite", e.target.checked)} /></td>
                    <td>{!readOnly && <button type="button" aria-label="Supprimer" onClick={() => void remove("libre", f.id)}><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!readOnly && (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => void call("devis_libre_enregistrer", { _ligne_id: ligne.id, _f: { categorie: "achat" } })}><Plus className="mr-1 h-3.5 w-3.5" />Ligne libre</Button>
                {([["repas", "Repas"], ["frais_horaire", "Frais horaires"], ["coursier_22m3", "Coursier 22 m³"], ["semi_remorque", "Semi-remorque"]] as const).map(([k, lbl]) => (
                  <Button key={k} size="sm" variant="ghost" onClick={() => void call("devis_libre_enregistrer", { _ligne_id: ligne.id, _f: { forfait_cle: k, designation: lbl } })}>+ {lbl}</Button>
                ))}
              </div>
            )}
          </section>

          <div className="flex justify-end border-t pt-2 text-sm font-semibold">Total {TYPE_LABEL[ligne.type].toLowerCase()} : {eur(totalLigne)}</div>
        </>
      )}

      <MateriauAjoutDialog open={matOpen} onOpenChange={setMatOpen} devisId={devisId}
        onAdd={async (p) => { await call("devis_materiau_enregistrer", { _ligne_id: ligne.id, _m: p }); void ecarts.refetch(); }} />
    </div>
  );
}
