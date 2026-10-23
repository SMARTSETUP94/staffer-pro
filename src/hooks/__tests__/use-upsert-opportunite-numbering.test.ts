// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpsertOpportunite } from "@/hooks/use-upsert-opportunite";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), single: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
  },
}));

describe("Numéro réellement attribué à une opportunité", () => {
  beforeEach(() => vi.clearAllMocks());
  it("relit 9438 lorsque le code proposé 9437 a été pris entre-temps", async () => {
    mocks.rpc.mockResolvedValue({ data: "created-id", error: null });
    mocks.single.mockResolvedValue({ data: { numero: "9438" }, error: null });
    const { result } = renderHook(() => useUpsertOpportunite());
    expect(await result.current.create({ code: "9437", client: "Client", charge_affaires_id: "charge-id", date_opportunite: "2026-10-23" }))
      .toEqual({ kind: "created", affaireId: "created-id", numero: "9438" });
  });
});