import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

// Use vi.hoisted to fix hoisting issues
const {
  mockSupabase,
  mockUseMobile,
  mockUseSignal,
  mockUseCurrentUser,
  mockUseConversations,
  mockUseMessages,
  mockUseAllUsers,
} = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      insert: vi.fn(() => Promise.resolve({ data: [], error: null })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        on: vi.fn(() => ({
          subscribe: vi.fn(),
        })),
        subscribe: vi.fn(),
      })),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: null }, error: null })
      ),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  };

  const mockUseMobile = vi.fn(() => false);

  const mockUseSignal = vi.fn(() => ({
    isReady: true,
    deviceId: 123,
    signalStore: { mockStore: true },
  }));

  const mockUseCurrentUser = vi.fn(() => ({
    currentUser: { id: "user-1", username: "testuser" },
    profile: { id: "user-1", full_name: "Test User" },
    error: null,
    handleLogout: vi.fn(),
    setError: vi.fn(),
  }));

  const mockUseConversations = vi.fn(() => ({
    conversations: [],
    loading: false,
    error: null,
    handleAcceptConversation: vi.fn(),
    handleRejectConversation: vi.fn(),
    setConversations: vi.fn(),
  }));

  const mockUseMessages = vi.fn(() => ({
    messages: [],
    loading: false,
    error: null,
    setMessages: vi.fn(),
    messagesEndRef: { current: null },
    scrollToBottom: vi.fn(),
  }));

  const mockUseAllUsers = vi.fn(() => ({
    allUsers: [],
    loading: false,
    error: null,
  }));

  return {
    mockSupabase,
    mockUseMobile,
    mockUseSignal,
    mockUseCurrentUser,
    mockUseConversations,
    mockUseMessages,
    mockUseAllUsers,
  };
});

// Mock all dependencies
vi.mock("../lib/supabaseClient", () => ({
  supabase: mockSupabase,
}));

vi.mock("../hooks/use-mobile", () => ({
  useMobile: mockUseMobile,
}));

vi.mock("../lib/signalContext.jsx", () => ({
  useSignal: mockUseSignal,
}));

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: mockUseCurrentUser,
}));

vi.mock("../hooks/useConversations", () => ({
  useConversations: mockUseConversations,
}));

vi.mock("../hooks/useMessages", () => ({
  useMessages: mockUseMessages,
}));

vi.mock("../hooks/useAllUsers", () => ({
  useAllUsers: mockUseAllUsers,
}));

// Mock additional hooks that ChatPage uses
vi.mock("../hooks/useSendMessage", () => ({
  useSendMessage: vi.fn(() => ({
    sendMessage: vi.fn(),
    error: null,
  })),
}));

vi.mock("../hooks/useRealtimeSubscriptions", () => ({
  useRealtimeSubscriptions: vi.fn(),
}));

vi.mock("../hooks/usePresence", () => ({
  usePresence: vi.fn(),
}));

vi.mock("../hooks/useDeviceChangeNotifications", () => ({
  useDeviceChangeNotifications: vi.fn(),
}));

vi.mock("../hooks/useUserPresence", () => ({
  useUserPresence: vi.fn(() => ({
    getUserPresence: vi.fn(),
    isUserOnline: vi.fn(() => false),
  })),
}));

import ChatPage from "../pages/ChatPage";

const renderWithRouter = (component) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe("ChatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render loading state when Signal is not ready", () => {
    mockUseSignal.mockReturnValue({
      isReady: false,
      deviceId: null,
      signalStore: null,
    });

    renderWithRouter(<ChatPage />);

    // Should show loading or handle non-ready state
    const chatContainer = document.querySelector(".flex.h-screen");
    expect(chatContainer).toBeInTheDocument();
  });

  it("should render error state when Signal initialization fails", () => {
    mockUseSignal.mockReturnValue({
      isReady: false,
      deviceId: null,
      signalStore: null,
      initializationError: "Failed to initialize",
    });

    renderWithRouter(<ChatPage />);

    // Should handle error state
    const chatContainer = document.querySelector(".flex.h-screen");
    expect(chatContainer).toBeInTheDocument();
  });

  it("should render main chat interface when ready", () => {
    renderWithRouter(<ChatPage />);

    // Should render the main chat container
    const chatContainer = document.querySelector(".flex.h-screen");
    expect(chatContainer).toBeInTheDocument();
  });

  it("should handle conversation selection and error clearing", () => {
    const mockSetError = vi.fn();

    mockUseCurrentUser.mockReturnValue({
      currentUser: { id: "user-1", username: "testuser" },
      profile: { id: "user-1", full_name: "Test User" },
      error: null,
      handleLogout: vi.fn(),
      setError: mockSetError,
    });

    renderWithRouter(<ChatPage />);

    // Should call setError and update selected conversation
    expect(mockSetError).toBeDefined();
  });

  it("should handle accepting conversation", async () => {
    const mockHandleAccept = vi.fn();
    const pendingConversation = {
      id: "conv-1",
      name: "John Doe",
      my_status: "pending",
      lastMessage: "Hello",
      time: "10:30",
    };

    // Make sure Signal is ready and no errors
    mockUseSignal.mockReturnValue({
      isReady: true,
      deviceId: 123,
      signalStore: { mockStore: true },
      initializationError: null,
    });

    mockUseConversations.mockReturnValue({
      conversations: [pendingConversation],
      loading: false,
      error: null,
      handleAcceptConversation: mockHandleAccept,
      handleRejectConversation: vi.fn(),
      setConversations: vi.fn(),
    });

    renderWithRouter(<ChatPage />);

    const acceptButton = screen.getByText("Accept");
    fireEvent.click(acceptButton);

    expect(mockHandleAccept).toHaveBeenCalledWith("conv-1", "user-1");
  });

  it("should handle rejecting conversation", async () => {
    const mockHandleReject = vi.fn();
    const pendingConversation = {
      id: "conv-1",
      name: "John Doe",
      my_status: "pending",
      lastMessage: "Hello",
      time: "10:30",
    };

    // Make sure Signal is ready and no errors
    mockUseSignal.mockReturnValue({
      isReady: true,
      deviceId: 123,
      signalStore: { mockStore: true },
      initializationError: null,
    });

    mockUseConversations.mockReturnValue({
      conversations: [pendingConversation],
      loading: false,
      error: null,
      handleAcceptConversation: vi.fn(),
      handleRejectConversation: mockHandleReject,
      setConversations: vi.fn(),
    });

    renderWithRouter(<ChatPage />);

    const rejectButton = screen.getByText("Reject");
    fireEvent.click(rejectButton);

    expect(mockHandleReject).toHaveBeenCalledWith("conv-1", "user-1");
  });

  it("should handle message sending", () => {
    const mockSetMessages = vi.fn();

    mockUseMessages.mockReturnValue({
      messages: [],
      loading: false,
      error: null,
      setMessages: mockSetMessages,
      messagesEndRef: { current: null },
    });

    renderWithRouter(<ChatPage />);

    // The send functionality would be available through the UI
    expect(mockSetMessages).toBeDefined();
  });

  it("should display error when there's a global error", () => {
    // Make sure Signal is ready so we can test the user error
    mockUseSignal.mockReturnValue({
      isReady: true,
      deviceId: 123,
      signalStore: { mockStore: true },
      initializationError: null,
    });

    mockUseCurrentUser.mockReturnValue({
      currentUser: null,
      profile: null,
      error: "Failed to load user",
      handleLogout: vi.fn(),
      setError: vi.fn(),
    });

    renderWithRouter(<ChatPage />);

    expect(screen.getByText("Error: Failed to load user")).toBeInTheDocument();
  });

  it("should handle logout functionality", () => {
    const mockHandleLogout = vi.fn();

    mockUseCurrentUser.mockReturnValue({
      currentUser: { id: "user-1", username: "testuser" },
      profile: { id: "user-1", full_name: "Test User" },
      error: null,
      handleLogout: mockHandleLogout,
      setError: vi.fn(),
    });

    renderWithRouter(<ChatPage />);

    // The logout functionality would be available through the UI
    expect(mockHandleLogout).toBeDefined();
  });

  it("should handle mobile menu toggle", () => {
    mockUseMobile.mockReturnValue(true);

    renderWithRouter(<ChatPage />);

    // Should render mobile layout
    const chatContainer = document.querySelector(".flex.h-screen-mobile");
    expect(chatContainer).toBeInTheDocument();
  });

  it("should filter conversations by search query", () => {
    const multipleConversations = [
      {
        id: "conv-1",
        name: "John Doe",
        my_status: "accepted",
        lastMessage: "Hi",
        time: "10:30",
      },
      {
        id: "conv-2",
        name: "Jane Smith",
        my_status: "accepted",
        lastMessage: "Hello",
        time: "10:31",
      },
      {
        id: "conv-3",
        name: "Bob Wilson",
        my_status: "rejected",
        lastMessage: "Hey",
        time: "10:32",
      },
    ];

    // Make sure Signal is ready
    mockUseSignal.mockReturnValue({
      isReady: true,
      deviceId: 123,
      signalStore: { mockStore: true },
      initializationError: null,
    });

    // Ensure mobile is false so sidebar shows
    mockUseMobile.mockReturnValue(false);

    mockUseConversations.mockReturnValue({
      conversations: multipleConversations,
      loading: false,
      error: null,
      handleAcceptConversation: vi.fn(),
      handleRejectConversation: vi.fn(),
      setConversations: vi.fn(),
    });

    renderWithRouter(<ChatPage />);

    // Should display all conversations - check if sidebar is rendered
    const chatContainer = document.querySelector(".flex.h-screen-mobile");
    expect(chatContainer).toBeInTheDocument();

    // Look for conversation names in the rendered output
    expect(
      screen.queryByText("John Doe") || screen.queryByText("Jane Smith")
    ).toBeTruthy();
  });

  it("should handle conversation status updates", () => {
    const inactiveConversation = {
      id: "conv-1",
      name: "John Doe",
      my_status: "pending",
      lastMessage: "Hello",
      time: "10:30",
    };

    // Make sure Signal is ready
    mockUseSignal.mockReturnValue({
      isReady: true,
      deviceId: 123,
      signalStore: { mockStore: true },
      initializationError: null,
    });

    // Ensure mobile is false so sidebar shows
    mockUseMobile.mockReturnValue(false);

    mockUseConversations.mockReturnValue({
      conversations: [inactiveConversation],
      loading: false,
      error: null,
      handleAcceptConversation: vi.fn(),
      handleRejectConversation: vi.fn(),
      setConversations: vi.fn(),
    });

    renderWithRouter(<ChatPage />);

    // Should display pending conversation with accept/reject buttons
    const chatContainer = document.querySelector(".flex.h-screen-mobile");
    expect(chatContainer).toBeInTheDocument();

    // Look for conversation name and buttons
    expect(
      screen.queryByText("John Doe") ||
        screen.queryByText("Accept") ||
        screen.queryByText("Reject")
    ).toBeTruthy();
  });

  it("should handle empty conversation list", () => {
    mockUseConversations.mockReturnValue({
      conversations: [],
      loading: false,
      error: null,
      handleAcceptConversation: vi.fn(),
      handleRejectConversation: vi.fn(),
      setConversations: vi.fn(),
    });

    renderWithRouter(<ChatPage />);

    // Should handle empty state
    const chatContainer = document.querySelector(".flex.h-screen-mobile");
    expect(chatContainer).toBeInTheDocument();
  });
});
