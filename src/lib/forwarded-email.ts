/**
 * Détection de l'expéditeur d'origine dans un email transféré (TR:/Fw:).
 * Le corps d'un transfert contient des blocs d'en-tête du type :
 *   De : Jean Dupont <jean@client.fr>
 *   From: Jean Dupont <jean@client.fr>
 *   Envoyé : jeudi 10 octobre 2026 ...
 * On retient le bloc « De/From » le PLUS BAS dans le corps (le message
 * d'origine, quand les transferts sont imbriqués).
 */

// NB : « Envoyé : » / « Sent: » sont les lignes de DATE dans Outlook — ne pas
// les inclure ici, elles écraseraient la ligne « De : » juste au-dessus.
const FROM_LINE = /(?:^|\n)\s*(?:De\s*|From)\s*:\s*(.+)/gi;
const EMAIL_IN_LINE = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

export interface OriginalSender {
  name: string | null;
  email: string | null;
}

/** Extrait l'expéditeur du message d'origine d'un email transféré. */
export function extractOriginalSender(body: string | null | undefined): OriginalSender | null {
  if (!body) return null;
  // Retire les balises HTML éventuelles pour retrouver les lignes d'en-tête.
  // Une balise contenant « @ » est en réalité une adresse <nom@domaine.fr> :
  // on la conserve.
  const text = body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<(?![^\s>]*@)[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

  let last: string | null = null;
  for (const match of text.matchAll(FROM_LINE)) {
    const line = match[1]?.trim();
    if (line) last = line;
  }
  if (!last) return null;

  const emailMatch = last.match(EMAIL_IN_LINE);
  const email = emailMatch?.[1] ?? null;
  // Nom = ce qui précède l'adresse, sans chevrons ni guillemets.
  let name: string | null = null;
  if (emailMatch) {
    const before = last.slice(0, emailMatch.index).replace(/[<"']/g, "").trim();
    name = before.length >= 2 ? before : null;
  }
  if (!email && !name) return null;
  return { name, email };
}
