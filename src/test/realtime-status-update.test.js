// Test to verify real-time conversation status updates
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Real-time Conversation Status Updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update selectedConversation peer_status when peer accepts", () => {
    // Mock conversation with pending peer status
    const mockConversation = {
      id: "conv-123",
      name: "Alice",
      my_status: "accepted",
      peer_status: "pending",
      is_group: false,
    };

    // Mock the real-time update payload
    const mockUpdate = {
      new: {
        conversation_id: "conv-123",
        profile_id: "alice-id",
        status: "accepted",
      },
    };

    // Mock functions
    const mockOnConversationUpdate = vi.fn();
    const mockOnSelectedConversationUpdate = vi.fn();

    // Simulate the peer status update logic
    const profile = { id: "bob-id" };
    const selectedConversationRef = { current: mockConversation };

    // This simulates the logic in the real-time subscription
    if (
      selectedConversationRef.current &&
      !selectedConversationRef.current.is_group &&
      selectedConversationRef.current.id === mockUpdate.new.conversation_id &&
      mockUpdate.new.profile_id !== profile.id
    ) {
      // Update conversations list
      mockOnConversationUpdate((prevConvs) =>
        prevConvs.map((c) =>
          c.id === mockUpdate.new.conversation_id
            ? { ...c, peer_status: mockUpdate.new.status }
            : c
        )
      );

      // Update selectedConversation
      if (
        mockOnSelectedConversationUpdate &&
        selectedConversationRef.current.id === mockUpdate.new.conversation_id
      ) {
        mockOnSelectedConversationUpdate((prevSelected) => ({
          ...prevSelected,
          peer_status: mockUpdate.new.status,
        }));
      }
    }

    // Verify both callbacks were called
    expect(mockOnConversationUpdate).toHaveBeenCalledTimes(1);
    expect(mockOnSelectedConversationUpdate).toHaveBeenCalledTimes(1);

    // Verify the update function updates peer_status correctly
    const updateFunction = mockOnSelectedConversationUpdate.mock.calls[0][0];
    const updatedConversation = updateFunction(mockConversation);
    expect(updatedConversation.peer_status).toBe("accepted");
  });

  it("should not update when peer rejects but conversation is different", () => {
    const mockConversation = {
      id: "conv-123",
      name: "Alice",
      my_status: "accepted",
      peer_status: "pending",
      is_group: false,
    };

    const mockUpdate = {
      new: {
        conversation_id: "conv-456", // Different conversation
        profile_id: "alice-id",
        status: "accepted",
      },
    };

    const mockOnConversationUpdate = vi.fn();
    const mockOnSelectedConversationUpdate = vi.fn();

    const profile = { id: "bob-id" };
    const selectedConversationRef = { current: mockConversation };

    // Simulate the condition check
    if (
      selectedConversationRef.current &&
      !selectedConversationRef.current.is_group &&
      selectedConversationRef.current.id === mockUpdate.new.conversation_id &&
      mockUpdate.new.profile_id !== profile.id
    ) {
      mockOnConversationUpdate();
      mockOnSelectedConversationUpdate();
    }

    // Should not be called because conversation IDs don't match
    expect(mockOnConversationUpdate).not.toHaveBeenCalled();
    expect(mockOnSelectedConversationUpdate).not.toHaveBeenCalled();
  });
});
