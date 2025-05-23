import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Mock supabase before imports
vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        in: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      update: vi.fn(() => ({
        match: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

import { useConversations } from "../hooks/useConversations";

describe("useConversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should initialize with empty state when no profileId", () => {
    const { result } = renderHook(() => useConversations(null));

    expect(result.current.conversations).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(null);
  });

  it("should provide all required functions", () => {
    const { result } = renderHook(() => useConversations("user-123"));

    expect(typeof result.current.handleAcceptConversation).toBe("function");
    expect(typeof result.current.handleRejectConversation).toBe("function");
    expect(typeof result.current.setConversations).toBe("function");
    expect(typeof result.current.fetchAndFormatSingleConversation).toBe(
      "function"
    );
  });

  it("should handle empty conversation list", async () => {
    const { result } = renderHook(() => useConversations("user-123"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.conversations).toEqual([]);
    expect(result.current.error).toBe(null);
  });
});
