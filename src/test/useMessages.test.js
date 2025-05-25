import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Use vi.hoisted to fix hoisting issues
const { mockFrom, mockSelect, mockEq, mockOrder, mockSignalUtils, mockDB } =
  vi.hoisted(() => {
    const mockFrom = vi.fn();
    const mockSelect = vi.fn();
    const mockEq = vi.fn();
    const mockOrder = vi.fn();

    const mockSignalUtils = {
      decryptMessage: vi.fn(),
      arrayBufferToString: vi.fn(),
      hexToUint8Array: vi.fn(),
    };

    const mockDB = {
      getCachedMessageContent: vi.fn(),
      getCachedMessagesForConversation: vi.fn(),
      cacheSentMessage: vi.fn(),
    };

    return { mockFrom, mockSelect, mockEq, mockOrder, mockSignalUtils, mockDB };
  });

// Mock dependencies
vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    from: mockFrom,
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(),
      })),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
  },
}));

vi.mock("../lib/signalUtils", () => mockSignalUtils);
vi.mock("../lib/db", () => mockDB);

vi.mock("@privacyresearch/libsignal-protocol-typescript", () => ({
  SignalProtocolAddress: vi.fn().mockImplementation((userId, deviceId) => ({
    toString: () => `${userId}.${deviceId}`,
  })),
}));

import { useMessages } from "../hooks/useMessages";

describe("useMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup correct chain: from().select().eq().order()
    const mockChainAfterEq = {
      order: mockOrder,
    };

    const mockChainAfterSelect = {
      eq: vi.fn(() => mockChainAfterEq),
    };

    mockSelect.mockReturnValue(mockChainAfterSelect);
    mockFrom.mockReturnValue({
      select: mockSelect,
    });

    mockOrder.mockResolvedValue({ data: [], error: null });
    mockDB.getCachedMessageContent.mockResolvedValue(null);
    mockDB.getCachedMessagesForConversation.mockResolvedValue([]);
    mockDB.cacheSentMessage.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockSelectedConversation = {
    id: "conv-1",
    participants: [
      { id: "user-1", username: "user1" },
      { id: "user-2", username: "user2" },
    ],
    my_status: "accepted",
  };

  const mockCurrentUser = { id: "user-1" };
  const mockDeviceId = 123;
  const mockSignalStore = { someStoreMethod: vi.fn() };

  it("should initialize with empty state", () => {
    const { result } = renderHook(() =>
      useMessages(null, null, false, null, null)
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("should not fetch when Signal context is not ready", () => {
    const { result } = renderHook(() =>
      useMessages(
        mockSelectedConversation,
        mockCurrentUser,
        false, // isReady = false
        mockDeviceId,
        mockSignalStore
      )
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("should not fetch when conversation is not accepted", () => {
    const inactiveConversation = {
      ...mockSelectedConversation,
      my_status: "pending",
    };

    const { result } = renderHook(() =>
      useMessages(
        inactiveConversation,
        mockCurrentUser,
        true,
        mockDeviceId,
        mockSignalStore
      )
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("should handle empty message list", async () => {
    const { result } = renderHook(() =>
      useMessages(
        mockSelectedConversation,
        mockCurrentUser,
        true,
        mockDeviceId,
        mockSignalStore
      )
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBe(null);
  });

  it("should handle Supabase fetch error", async () => {
    const fetchError = new Error("Database connection failed");
    // Reset mocks for this test to return error
    mockOrder.mockResolvedValueOnce({ data: null, error: fetchError });

    const { result } = renderHook(() =>
      useMessages(
        mockSelectedConversation,
        mockCurrentUser,
        true,
        mockDeviceId,
        mockSignalStore
      )
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(
      "Failed to load messages: Database connection failed"
    );
    expect(result.current.messages).toEqual([]);
  });

  it("should provide required functions and refs", () => {
    const { result } = renderHook(() =>
      useMessages(null, null, false, null, null)
    );

    expect(typeof result.current.setMessages).toBe("function");
    expect(result.current.messagesEndRef).toBeDefined();
    expect(result.current.messagesEndRef.current).toBe(null);
    expect(typeof result.current.scrollToBottom).toBe("function");
  });

  it("should use cached message content when available", async () => {
    const mockRawMessages = [
      {
        id: "msg-1",
        body: "deadbeef",
        type: 3,
        created_at: "2023-01-01T10:00:00Z",
        profile_id: "user-2",
        device_id: 1,
        target_device_id: mockDeviceId,
        profiles: {
          id: "user-2",
          full_name: "User Two",
          username: "user2",
          avatar_url: "avatar2.jpg",
        },
      },
    ];

    const mockCachedMessages = [
      {
        id: "msg-1",
        content: "Cached message content",
        timestamp: "2023-01-01T10:00:00Z",
      },
    ];

    // Reset mock for this specific test
    mockOrder.mockResolvedValueOnce({ data: mockRawMessages, error: null });
    mockDB.getCachedMessagesForConversation.mockResolvedValueOnce(
      mockCachedMessages
    );

    const { result } = renderHook(() =>
      useMessages(
        mockSelectedConversation,
        mockCurrentUser,
        true,
        mockDeviceId,
        mockSignalStore
      )
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe("Cached message content");
    expect(mockSignalUtils.decryptMessage).not.toHaveBeenCalled();
  });
});
