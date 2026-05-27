/**
 * L3b1 — Tests unitaires de useCapabilityScope.
 *
 * Mock Supabase RPC `user_cap_scope` et useAuth pour vérifier :
 *  - scope unique correctement retourné
 *  - cas multi-rôle : RPC est la source de vérité (renvoie déjà le MAX),
 *    le hook le restitue tel quel
 *  - fallback "none" en cas d'erreur RPC
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    loading: false,
  }),
}));

import { useCapabilityScope } from "@/hooks/use-capability";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useCapabilityScope", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("retourne le scope unique retourné par le RPC", async () => {
    rpcMock.mockResolvedValueOnce({ data: "own", error: null });

    const { result } = renderHook(() => useCapabilityScope("heures.personnelles.saisir"), {
      wrapper,
    });

    await waitFor(() => expect(result.current).toBe("own"));
    expect(rpcMock).toHaveBeenCalledWith("user_cap_scope", {
      _cap: "heures.personnelles.saisir",
    });
  });

  it("multi-rôle : restitue le scope MAX déjà résolu côté RPC (all)", async () => {
    // Le RPC user_cap_scope retourne le MAX (admin=all gagne sur chef=team).
    rpcMock.mockResolvedValueOnce({ data: "all", error: null });

    const { result } = renderHook(() => useCapabilityScope("action.casting.manage"), {
      wrapper,
    });

    await waitFor(() => expect(result.current).toBe("all"));
  });

  it('fallback "none" si le RPC retourne une erreur', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    const { result } = renderHook(() => useCapabilityScope("missing.cap"), {
      wrapper,
    });

    await waitFor(() => expect(result.current).toBe("none"));
  });
});
