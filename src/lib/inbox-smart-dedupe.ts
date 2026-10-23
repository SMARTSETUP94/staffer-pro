/** Only exact historical matches may acquire a stable Message-ID. */
export type InboxMessageIdentity = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  receivedDateTime?: string;
  subject?: string;
  from?: { address?: string };
};

export type ImportedEmailIdentity = {
  id: string;
  message_id_outlook: string;
  internet_message_id: string | null;
  conversation_id: string | null;
  received_at: string;
  from_email: string;
  subject: string | null;
};

export function findImportedEmail(msg: InboxMessageIdentity, rows: ImportedEmailIdentity[]) {
  const stableId = msg.internetMessageId?.trim();
  const direct = rows.find((row) => row.message_id_outlook === msg.id ||
    (stableId && row.internet_message_id === stableId));
  if (direct) return { row: direct, ambiguous: false };
  // Old imports predate internetMessageId and stored the pre-move Outlook ID.
  // Conversation alone is never enough: each reply has a distinct Message-ID.
  if (!stableId || !msg.conversationId || !msg.receivedDateTime || !msg.from?.address) {
    return { row: undefined, ambiguous: false };
  }
  const matches = rows.filter((row) => !row.internet_message_id &&
    row.conversation_id === msg.conversationId &&
    Date.parse(row.received_at) === Date.parse(msg.receivedDateTime ?? "") &&
    (row.from_email === "unknown@unknown" || row.from_email.toLowerCase() === msg.from?.address?.toLowerCase()) &&
    row.subject === (msg.subject ?? null));
  return { row: matches.length === 1 ? matches[0] : undefined, ambiguous: matches.length > 1 };
}