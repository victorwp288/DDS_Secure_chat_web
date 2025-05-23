import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Use vi.hoisted to fix hoisting issues
const { mockFrom, mockSelect, mockEq, mockIn, mockUpdate, mockMatch } =
  vi.hoisted(() => {
    const mockFrom = vi.fn();
    const mockSelect = vi.fn();
    const mockEq = vi.fn();
    const mockIn = vi.fn();
    const mockUpdate = vi.fn();
    const mockMatch = vi.fn();

    return { mockFrom, mockSelect, mockEq, mockIn, mockUpdate, mockMatch };
  });

// Mock supabase
vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    from: mockFrom,
  },
}));

import { useConversations } from "../hooks/useConversations";

describe("useConversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default chain
    mockFrom.mockReturnValue({
      select: mockSelect,
      update: mockUpdate,
    });

    mockSelect.mockReturnValue({
      eq: mockEq,
      in: mockIn,
    });

    mockUpdate.mockReturnValue({
      match: mockMatch,
    });

    mockEq.mockResolvedValue({ data: [], error: null });
    mockIn.mockResolvedValue({ data: [], error: null });
    mockMatch.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockProfileId = "user-123";

  it("should initialize with empty state when no profileId", () => {
    const { result } = renderHook(() => useConversations(null));

    expect(result.current.conversations).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(null);
  });

  it("should provide all required functions", () => {
    const { result } = renderHook(() => useConversations(mockProfileId));

    expect(typeof result.current.handleAcceptConversation).toBe("function");
    expect(typeof result.current.handleRejectConversation).toBe("function");
    expect(typeof result.current.setConversations).toBe("function");
    expect(typeof result.current.fetchAndFormatSingleConversation).toBe(
      "function"
    );
  });

  it("should handle empty conversation list", async () => {
    const { result } = renderHook(() => useConversations(mockProfileId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.conversations).toEqual([]);
    expect(result.current.error).toBe(null);
  });

  it("should handle participant fetch error", async () => {
    const fetchError = new Error("Database error");
    mockEq.mockResolvedValueOnce({ data: null, error: fetchError });

    const { result } = renderHook(() => useConversations(mockProfileId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load conversations.");
    expect(result.current.conversations).toEqual([]);
  });

  it("should accept conversation successfully", async () => {
    const { result } = renderHook(() => useConversations(mockProfileId));

    // Wait for initial loading to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Set up initial conversation state
    act(() => {
      result.current.setConversations([
        {
          id: "conv-1",
          name: "Test Chat",
          my_status: "pending",
        },
      ]);
    });

    // Mock successful update
    mockMatch.mockResolvedValueOnce({
      error: null,
    });

    await act(async () => {
      await result.current.handleAcceptConversation("conv-1", mockProfileId);
    });

    // Check that the conversation status was updated in the state
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].my_status).toBe("accepted");
  });

  it("should handle accept conversation error", async () => {
    const { result } = renderHook(() => useConversations(mockProfileId));

    const updateError = new Error("Update failed");
    mockMatch.mockResolvedValueOnce({ error: updateError });

    await expect(
      result.current.handleAcceptConversation("conv-1", mockProfileId)
    ).rejects.toThrow("Failed to accept chat: Update failed");
  });

  it("should reject conversation successfully", async () => {
    const { result } = renderHook(() => useConversations(mockProfileId));

    // Wait for initial loading to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Set up initial conversation state
    act(() => {
      result.current.setConversations([
        {
          id: "conv-1",
          name: "Test Chat",
          my_status: "pending",
        },
      ]);
    });

    // Mock successful update
    mockMatch.mockResolvedValueOnce({
      error: null,
    });

    await act(async () => {
      await result.current.handleRejectConversation("conv-1", mockProfileId);
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].my_status).toBe("rejected");
  });
});
