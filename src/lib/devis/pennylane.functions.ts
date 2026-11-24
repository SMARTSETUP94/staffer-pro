/** Rapprochement clients et transfert manuel des devis signés vers Pennylane (admin + commercial). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { construirePennylane, controleTotal, rapprocherClients, type ClientStaffing, type DonneesPennylane } from "./pennylane";
import { appelPennylane, chercherDevisParReference, listerClientsPennylane, lireDevisPennylane, PennylaneErreur } from "./pennylane-api.server";
import { refDevis } from "./pdf-client";

async function exigerDroit(supabase: any) {
  const { data } = await supabase.rpc("current_user_has_capability", { _cap_key: "devis.pennylane" });
  if (!data) throw new Error("Réservé aux admins et commerciaux");
}
const messageErreur = (e: unknown) => (e instanceof Error ? e.message : "Erreur inattendue");

export const etatPennylane = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigerDroit(context.supabase);
    return { jeton: !!process.env["PENNYLANE_API_TOKEN"] };
  });

export const rapprochementClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigerDroit(context.supabase);
    const staffing: ClientStaffing[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await context.supabase.from("clients").select("id,nom,siret,tva_intracom,pennylane_id").order("nom").range(from, from + 999);
      if (error) throw new Error(error.message);
      staffing.push(...((data ?? []) as ClientStaffing[]));
      if ((data ?? []).length < 1000) break;
    }
    try {
      const pl = await listerClientsPennylane();
      return { erreur: null as string | null, nbPennylane: pl.length, lignes: rapprocherClients(staffing, pl) };
    } catch (e) {
      return { erreur: messageErreur(e), nbPennylane: 0, lignes: [] };
    }
  });

export const preparerTransfert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ devisId: z.string().uuid(), options: z.array(z.string().uuid()).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await exigerDroit(context.supabase);
    if (!process.env["PENNYLANE_API_TOKEN"]) throw new Error("Jeton Pennylane non configuré");
    const { error } = await context.supabase.rpc("devis_pennylane_reserver", { _devis_id: data.devisId, _options: data.options });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const transfererDevis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ devisId: z.string().uuid(), pdfPath: z.string().min(1).max(300).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await exigerDroit(sb);
    const echec = async (detail: Record<string, unknown>) => { await sb.rpc("devis_pennylane_echec", { _devis_id: data.devisId, _detail: detail as never }); };
    const etat = await sb.from("devis").select("pennylane_etat,pennylane_options_retenues,pennylane_quote_id,remise_mode,remise_valeur,client_id").eq("id", data.devisId).maybeSingle();
    if (etat.error || !etat.data) throw new Error("Devis introuvable");
    if (etat.data.pennylane_quote_id) throw new Error("Ce devis est déjà transféré vers Pennylane");
    if (etat.data.pennylane_etat !== "en_cours") throw new Error("Aucun transfert préparé pour ce devis");
    const cl = await sb.from("clients").select("pennylane_id").eq("id", etat.data.client_id as string).maybeSingle();
    const customerId = Number(cl.data?.pennylane_id);
    if (!customerId) { await echec({ raison: "client non rapproché" }); throw new Error("Client non rapproché avec Pennylane"); }
    const lu = await sb.rpc("devis_lire_client", { _devis_id: data.devisId });
    if (lu.error || !lu.data) { await echec({ raison: "lecture devis" }); throw new Error("Lecture du devis impossible"); }
    const v = { ...(lu.data as unknown as DonneesPennylane), remise_mode: etat.data.remise_mode, remise_valeur: etat.data.remise_valeur };
    const reference = refDevis(v);
    let construit;
    try { construit = construirePennylane(v, new Set(etat.data.pennylane_options_retenues ?? []), { customerId, reference }); }
    catch (e) { await echec({ raison: messageErreur(e) }); throw e; }

    let quote: any;
    try {
      quote = await chercherDevisParReference(reference);
      if (!quote) quote = await appelPennylane("/quotes", { method: "POST", json: construit.payload });
    } catch (e) {
      await echec({ raison: messageErreur(e), statut: e instanceof PennylaneErreur ? e.statut : null });
      throw new Error(messageErreur(e));
    }
    const id = String(quote?.id ?? "");
    if (!id) { await echec({ raison: "réponse sans identifiant" }); throw new Error("Pennylane n'a pas renvoyé d'identifiant"); }

    let relu = lireDevisPennylane(quote);
    try { relu = lireDevisPennylane(await appelPennylane(`/quotes/${encodeURIComponent(id)}`)); } catch { /* relecture impossible → écart */ }
    const ctrl = controleTotal(construit.attendu.net_ht, relu.total_ht);

    let pieceJointe = false; let pieceErreur: string | null = null;
    if (data.pdfPath && data.pdfPath.startsWith(`${data.devisId}/`)) {
      try {
        const f = await sb.storage.from("devis-exports").download(data.pdfPath);
        if (f.error || !f.data) throw new Error("PDF introuvable");
        const form = new FormData();
        form.append("file", new Blob([await f.data.arrayBuffer()], { type: "application/pdf" }), `Devis ${reference}.pdf`);
        await appelPennylane(`/quotes/${encodeURIComponent(id)}/appendices`, { method: "POST", form });
        pieceJointe = true;
      } catch (e) { pieceErreur = messageErreur(e); }
    }

    const { error } = await sb.rpc("devis_pennylane_enregistrer", {
      _devis_id: data.devisId, _quote_id: id, _numero: relu.numero ?? "", _lien: relu.lien ?? "",
      _total_ht: ctrl.lu ?? (null as never), _ecart: !ctrl.ok,
      _detail: { attendu_net_ht: construit.attendu.net_ht, lu_ht: ctrl.lu, ecart: ctrl.ecart, piece_jointe: pieceJointe, piece_erreur: pieceErreur, lignes: construit.payload.invoice_lines.length } as never,
    });
    if (error) throw new Error(`Devis créé dans Pennylane (${id}) mais enregistrement Staffing impossible : ${error.message}`);
    return { quoteId: id, numero: relu.numero, controle: ctrl, attendu: construit.attendu.net_ht, pieceJointe, pieceErreur };
  });
