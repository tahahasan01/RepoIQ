import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const signOut = vi.fn(async () => {});
vi.mock("@/lib/api", () => ({ signOut: (...args: unknown[]) => signOut(...(args as [])) }));

import { useAuth } from "@/hooks/useAuth";

describe("useAuth().logout", () => {
  it("goes through the single signOut implementation", async () => {
    localStorage.setItem("user", JSON.stringify({ id: "u1" }));
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout({ redirectTo: "/" });
    });

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
    expect(result.current.user).toBeNull();
  });
});
