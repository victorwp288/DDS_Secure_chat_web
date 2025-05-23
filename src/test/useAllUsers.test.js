import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Use vi.hoisted to fix hoisting issues
const { mockFrom, mockSelect, mockNeq } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockNeq = vi.fn();

  return { mockFrom, mockSelect, mockNeq };
});

// Mock supabase
vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    from: mockFrom,
  },
}));

import { useAllUsers } from "../hooks/useAllUsers";

describe("useAllUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default chain
    mockFrom.mockReturnValue({
      select: mockSelect,
    });

    mockSelect.mockReturnValue({
      neq: mockNeq,
    });

    mockNeq.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const currentUserId = "current-user-123";

  it("should initialize with empty state", () => {
    const { result } = renderHook(() => useAllUsers(null));

    expect(result.current.allUsers).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("should not fetch when currentUserId is not provided", () => {
    renderHook(() => useAllUsers(null));

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("should fetch users successfully", async () => {
    const mockUsers = [
      {
        id: "user-1",
        username: "user1",
        full_name: "User One",
        avatar_url: "avatar1.jpg",
      },
      {
        id: "user-2",
        username: "user2",
        full_name: "User Two",
        avatar_url: "avatar2.jpg",
      },
    ];

    mockNeq.mockResolvedValueOnce({ data: mockUsers, error: null });

    const { result } = renderHook(() => useAllUsers(currentUserId));

    // Initially loading should be true
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.allUsers).toEqual(mockUsers);
    expect(result.current.error).toBe(null);

    // Verify correct Supabase call
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockSelect).toHaveBeenCalledWith(
      "id, username, full_name, avatar_url"
    );
    expect(mockNeq).toHaveBeenCalledWith("id", currentUserId);
  });

  it("should handle empty user list", async () => {
    const { result } = renderHook(() => useAllUsers(currentUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.allUsers).toEqual([]);
    expect(result.current.error).toBe(null);
  });

  it("should handle fetch error", async () => {
    const fetchError = new Error("Database connection failed");
    mockNeq.mockResolvedValueOnce({ data: null, error: fetchError });

    const { result } = renderHook(() => useAllUsers(currentUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.allUsers).toEqual([]);
    expect(result.current.error).toBe(
      "Failed to load users for group creation."
    );
  });

  it("should handle null data response", async () => {
    mockNeq.mockResolvedValueOnce({ data: null, error: null });

    const { result } = renderHook(() => useAllUsers(currentUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.allUsers).toEqual([]);
    expect(result.current.error).toBe(null);
  });

  it("should refetch when currentUserId changes", async () => {
    const mockUsers1 = [
      {
        id: "user-1",
        username: "user1",
        full_name: "User One",
        avatar_url: null,
      },
    ];
    const mockUsers2 = [
      {
        id: "user-2",
        username: "user2",
        full_name: "User Two",
        avatar_url: null,
      },
    ];

    // First render with first userId
    mockNeq.mockResolvedValueOnce({ data: mockUsers1, error: null });

    const { result, rerender } = renderHook(
      ({ userId }) => useAllUsers(userId),
      { initialProps: { userId: "user-first" } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.allUsers).toEqual(mockUsers1);

    // Second render with different userId
    mockNeq.mockResolvedValueOnce({ data: mockUsers2, error: null });

    rerender({ userId: "user-second" });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.allUsers).toEqual(mockUsers2);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});
