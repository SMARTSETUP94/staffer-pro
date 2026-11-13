/**
 * Apprentissage par corrections : on garde ce que l'IA a proposé vs ce que
 * l'équipe a réellement retenu (+ commentaire libre), et on réinjecte les
 * dernières corrections comme exemples dans la consigne IA log@.
 */
export type FbLine = { type: string; date: string; contenu: string; heure_debut?: string | null; heure_fin?: string | null; lieu?: string | null };
export type FeedbackRow = { email_subject: string | null; propose: FbLine[]; retenu: FbLine[]; commentaire: string | null };

const fmt = (l: FbLine) =>
  `${l.type} ${l.date}${l.heure_debut ? ` ${l.heure_debut.slice(0, 5)}` : ""}${l.heure_fin ? `-${l.heure_fin.slice(0, 5)}` : ""} « ${l.contenu} »${l.lieu ? ` @ ${l.lieu}` : ""}`;

const motsSujet = (s?: string | null) => new Set((s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^(re|tr|fw|fwd)\s*:\s*/g, "").split(/[^a-z0-9]+/).filter((m) => m.length >= 3));
/** 5 à 8 corrections les plus proches du sujet (mots communs), jamais le mail lui-même. */
export function selectionnerExemples(rows: FeedbackRow[], sujet: string | null | undefined, max = 8, min = 5): FeedbackRow[] {
  const cible = motsSujet(sujet);
  const sc = rows.filter((r) => (r.email_subject ?? "") !== (sujet ?? "\u0000")).map((r, i) => {
    let n = 0; for (const m of motsSujet(r.email_subject)) if (cible.has(m)) n++;
    return { r, n, i };
  });
  sc.sort((a, b) => b.n - a.n || a.i - b.i);
  const proches = sc.filter((x) => x.n > 0).slice(0, max);
  const complement = sc.filter((x) => x.n === 0).slice(0, Math.max(0, min - proches.length));
  return [...proches, ...complement].map((x) => x.r);
}

export function feedbackToPrompt(rows: FeedbackRow[], max = 12): string {
  const useful = rows.filter((r) => (r.commentaire && r.commentaire.trim()) || JSON.stringify(r.propose) !== JSON.stringify(r.retenu)).slice(0, max);
  if (useful.length === 0) return "";
  const parts = useful.map((r, i) => {
    const key = (l: FbLine) => `${l.type}|${l.contenu}`;
    const kept = new Set(r.retenu.map(key));
    const rejetes = r.propose.filter((l) => !kept.has(key(l)));
    return [
      `Exemple ${i + 1} — email « ${(r.email_subject ?? "").slice(0, 100)} »`,
      rejetes.length ? `  Proposé à tort (écarté par l'équipe) : ${rejetes.map(fmt).join(" ; ")}` : "",
      `  Retenu par l'équipe : ${r.retenu.map(fmt).join(" ; ") || "rien"}`,
      r.commentaire?.trim() ? `  Commentaire de l'équipe : ${r.commentaire.trim().slice(0, 400)}` : "",
    ].filter(Boolean).join("\n");
  });
  return "\nCorrections récentes de l'équipe SETUP sur tes propositions d'échéances — inspire-t'en pour ce qui est pertinent ou non :\n" + parts.join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadFeedbackRows(supa: any): Promise<FeedbackRow[]> {
  try {
    const { data } = await supa.from("ia_feedback_logistique")
      .select("email_subject, propose, retenu, commentaire").order("created_at", { ascending: false }).limit(60);
    return (data ?? []) as FeedbackRow[];
  } catch { return []; }
}
/** Consigne d'exemples propre à un mail : corrections utiles les plus proches de son sujet. */
export function exemplesPourMail(rows: FeedbackRow[], sujet: string | null | undefined): string {
  const utiles = rows.filter((r) => (r.commentaire && r.commentaire.trim()) || JSON.stringify(r.propose) !== JSON.stringify(r.retenu));
  return feedbackToPrompt(selectionnerExemples(utiles, sujet), 8);
}

export async function loadFeedbackPrompt(supa: any): Promise<string> {
  try {
    const { data } = await supa.from("ia_feedback_logistique")
      .select("email_subject, propose, retenu, commentaire").order("created_at", { ascending: false }).limit(30);
    return feedbackToPrompt((data ?? []) as FeedbackRow[]);
  } catch { return ""; }
}
