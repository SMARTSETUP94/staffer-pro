import { describe, expect, it } from "vitest";
import { findImportedEmail, type ImportedEmailIdentity } from "../inbox-smart-dedupe";

const historical: ImportedEmailIdentity = {
  id: "record-1", message_id_outlook: "before-move", internet_message_id: null,
  conversation_id: "thread-1", received_at: "2026-10-23T10:00:00Z",
  from_email: "client@example.com", subject: "Demande de devis",
};
const restored = {
  id: "after-move", internetMessageId: "<stable@example.com>", conversationId: "thread-1",
  receivedDateTime: "2026-10-23T10:00:00.000Z", from: { address: "client@example.com" },
  subject: "Demande de devis",
};

describe("stable inbox deduplication", () => {
  it("does not reimport an email with a changed Outlook ID and the same internetMessageId", () => {
    expect(findImportedEmail(restored, [{ ...historical, internet_message_id: restored.internetMessageId }]).row?.id).toBe("record-1");
  });
  it("still deduplicates by message_id_outlook", () => {
    expect(findImportedEmail({ id: "before-move" }, [historical]).row?.id).toBe("record-1");
  });
  it("recognizes a restored historical import lacking internetMessageId", () => {
    expect(findImportedEmail(restored, [historical]).row?.id).toBe("record-1");
  });
  it("recognizes legacy imports whose sender was not extracted from Graph", () => {
    expect(findImportedEmail(restored, [{ ...historical, from_email: "unknown@unknown" }]).row?.id).toBe("record-1");
  });
  it("does not mistake a different reply in the same conversation for the old email", () => {
    expect(findImportedEmail({ ...restored, receivedDateTime: "2026-10-23T11:00:00Z" }, [historical]).row).toBeUndefined();
  });
  it("fails closed when historical identity matches more than one row", () => {
    expect(findImportedEmail(restored, [historical, { ...historical, id: "record-2" }])).toEqual({ row: undefined, ambiguous: true });
  });
});